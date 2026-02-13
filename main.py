import pathway as pw
from pathway.stdlib.indexing.nearest_neighbors import BruteForceKnnFactory
from pathway.xpacks.llm import llms
from pathway.xpacks.llm.document_store import DocumentStore
from pathway.xpacks.llm.splitters import TokenCountSplitter
from pathway.xpacks.llm.llms import LiteLLMChat
from pathway.xpacks.llm.embedders import SentenceTransformerEmbedder
import os
from dotenv import load_dotenv

# Import feature modules
from features.feature_tcp_flags import detect_abnormal_flags
from features.feature_ttl import analyze_ttl
from features.feature_small_packets import detect_small_packet_flow
from features.feature_sequence import analyze_sequence
from features.feature_encryption import get_encryption_label

load_dotenv()

class PacketSchema(pw.Schema):
    timestamp: str
    protocols: str
    src_ip: str | None
    dst_ip: str | None
    src_port: str | None
    dst_port: str | None
    packet_size: str | None
    payload_len: str | None
    info: str | None
    tcp_seq: str | None
    tcp_flags_syn: str | None
    tcp_flags_ack: str | None
    tcp_flags_fin: str | None
    tcp_flags_rst: str | None
    tcp_flags_psh: str | None
    tcp_flags_urg: str | None
    tcp_retransmission: str | None
    tcp_window_size: str | None
    ttl_hop_limit: str | None
    fragmentation: str | None

# 1. Read Raw Packets (Live Stream)
packets = pw.io.fs.read("./docs", format="json", schema=PacketSchema, glob="live_packets.json")

@pw.udf
def safe_float_udf(x: str | None) -> float:
    try:
        if x is not None and str(x).strip():
            return float(x)
    except (ValueError, TypeError):
        pass
    return 0.0
@pw.udf
def to_bool_udf(val: str | None) -> bool:
    if val is None: return False
    return str(val).lower() in ("1", "true", "yes")

@pw.udf
def format_flow_id_udf(s: str | None, d: str | None, sp: str | None, dp: str | None) -> str:
    return f"{s or '?'}:{sp or '?' } -> {d or '?'}:{dp or '?'}"

@pw.udf
def get_last_packet_info_udf(infos: tuple) -> str:
    return str(infos[-1]) if infos else "None"

@pw.udf
def get_last_encryption_udf(encs: tuple) -> str:
    return str(encs[-1]) if encs else "Unknown"

# 2. Add individual packet features
packets = packets.select(
    *pw.this,
    abnormal_flags = pw.apply(
        detect_abnormal_flags, 
        pw.this.tcp_flags_syn, pw.this.tcp_flags_ack, pw.this.tcp_flags_fin, 
        pw.this.tcp_flags_rst, pw.this.tcp_flags_psh, pw.this.tcp_flags_urg
    ),
    is_encrypted = pw.apply(get_encryption_label, pw.this.protocols, pw.this.dst_port)
)

# 3. Flow Builder (5-tuple aggregation)
flows = packets.groupby(
    pw.this.src_ip, pw.this.dst_ip, pw.this.src_port, pw.this.dst_port
).reduce(
    src_ip = pw.reducers.max(pw.this.src_ip),
    dst_ip = pw.reducers.max(pw.this.dst_ip),
    src_port = pw.reducers.max(pw.this.src_port),
    dst_port = pw.reducers.max(pw.this.dst_port),
    packet_count = pw.reducers.count(),
    avg_packet_size = pw.reducers.avg(safe_float_udf(pw.this.packet_size)),
    ttl_list = pw.reducers.tuple(pw.this.ttl_hop_limit),
    seq_list = pw.reducers.tuple(pw.this.tcp_seq),
    payload_len_list = pw.reducers.tuple(pw.this.payload_len),
    abnormal_flags_found = pw.reducers.tuple(pw.this.abnormal_flags),
    encryption_types = pw.reducers.tuple(pw.this.is_encrypted),
    latest_timestamp = pw.reducers.max(pw.this.timestamp),
    last_info = pw.reducers.tuple(pw.this.info)
)

# 4. Apply Behavioral Analysis to Flows
flow_analysis = flows.select(
    flow=format_flow_id_udf(pw.this.src_ip, pw.this.dst_ip, pw.this.src_port, pw.this.dst_port),
    ttl_anomaly = pw.apply(analyze_ttl, pw.this.ttl_list),
    sequence_anomaly = pw.apply(analyze_sequence, pw.this.seq_list),
    small_packet_anomaly = pw.apply(detect_small_packet_flow, pw.this.payload_len_list),
    flag_anomalies = pw.apply(lambda flags: [f for f in flags if f is not None], pw.this.abnormal_flags_found),
    encryption = get_last_encryption_udf(pw.this.encryption_types),
    packet_count = pw.this.packet_count,
    last_packet_time = pw.this.latest_timestamp,
    last_packet_info = get_last_packet_info_udf(pw.this.last_info)
)

# 5. Push to Web Dashboard (Rate-Limited Pulse)
# We window the analysis to send updates every 2s for UI stability
flow_pulse = flow_analysis.windowby(
    safe_float_udf(pw.this.last_packet_time),
    window=pw.temporal.tumbling(duration=2.0),
    instance=pw.this.flow
).reduce(
    flow = pw.reducers.max(pw.this.flow),
    ttl_anomaly = pw.reducers.max(pw.this.ttl_anomaly),
    sequence_anomaly = pw.reducers.max(pw.this.sequence_anomaly),
    small_packet_anomaly = pw.reducers.max(pw.this.small_packet_anomaly),
    flag_anomalies = pw.reducers.max(pw.this.flag_anomalies),
    encryption = pw.reducers.max(pw.this.encryption),
    packet_count = pw.reducers.max(pw.this.packet_count),
    last_packet_time = pw.reducers.max(pw.this.last_packet_time),
    last_packet_info = pw.reducers.max(pw.this.last_packet_info)
)

pw.io.http.write(
    flow_pulse,
    url="http://localhost:8000/api/update/",
    method="POST",
    headers={"Content-Type": "application/json"}
)

# 6. Format for LLM Indexing (DocumentStore)
@pw.udf
def format_doc_udf(f, ta, sa, spa, fa, enc, t, i) -> str:
    return (
        f"Flow: {f} | Time: {t} | Info: {i} | "
        f"Security Analysis: [Flags: {fa}, TTL: {ta}, Seq: {sa}, Traffic: {spa}] | "
        f"Type: {enc}"
    )

analyzed_docs = pw.Table.concat_reindex(
    flow_analysis.select(
        data = format_doc_udf(
            pw.this.flow, pw.this.ttl_anomaly, pw.this.sequence_anomaly, 
            pw.this.small_packet_anomaly, pw.this.flag_anomalies, 
            pw.this.encryption, pw.this.last_packet_time, pw.this.last_packet_info
        )
    ).select(
        pw.this.data,
        text=pw.this.data
    )
)

# Indexing
embedder = SentenceTransformerEmbedder(model="all-MiniLM-L6-v2")
retriever_factory = BruteForceKnnFactory(embedder=embedder)
document_store = DocumentStore(docs=analyzed_docs, retriever_factory=retriever_factory)

# Webserver & Queries
webserver = pw.io.http.PathwayWebserver(host="0.0.0.0", port=8011)

class QuerySchema(pw.Schema):
    messages: str

queries, writer = pw.io.http.rest_connector(
    webserver=webserver,
    schema=QuerySchema,
    autocommit_duration_ms=1000,
    delete_completed_queries=True
)
# Process Queries
queries_processed = queries.select(
    query = pw.this.messages,
    k = 3,
    metadata_filter = None,
    filepath_globpattern = None,
)

retrieved_documents = document_store.retrieve_query(queries_processed)
queries_context = queries_processed.join_left(retrieved_documents, id=queries_processed.id).select(
    *pw.left,
    pw.right.result
)

@pw.udf
def build_prompts_udf(documents, query) -> str:
    if not documents:
        return f"No context found. User Question: {query}"
    
    valid_docs = []
    for doc in documents:
        if doc is None: continue
        try:
            text = doc["text"] if "text" in doc else (doc["data"] if "data" in doc else "")
            if text:
                valid_docs.append(str(text))
        except (KeyError, TypeError):
            continue
            
    context = " ".join(valid_docs)
    return f"Network traffic summary: {context}\nUser Question: {query}\nProvide a concise analysis."

prompts = queries_context.select(
     prompt_text=build_prompts_udf(pw.this.result, pw.this.query)
)

model = LiteLLMChat(
    model="openrouter/arcee-ai/trinity-large-preview:free",
    api_key=os.environ.get("OPENROUTER_API_KEY"),
    base_url="https://openrouter.ai/api/v1",
    retry_strategy=pw.udfs.FixedDelayRetryStrategy(2,3)
)

responses = prompts.select(
    result = pw.apply(lambda r: str(r), model(llms.prompt_chat_single_qa(pw.this.prompt_text)))
)

writer(responses)
pw.run()