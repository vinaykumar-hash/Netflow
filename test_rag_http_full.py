import pathway as pw
import pandas as pd
import uuid
from pathway.stdlib.indexing.nearest_neighbors import BruteForceKnnFactory
from pathway.xpacks.llm.document_store import DocumentStore
from pathway.xpacks.llm.embedders import SentenceTransformerEmbedder

# 1. Docs
df = pd.DataFrame({"data": [b"Hello"]})
docs = pw.debug.table_from_pandas(df).select(data=pw.this.data)

embedder = SentenceTransformerEmbedder(model="all-MiniLM-L6-v2")
retriever_factory = BruteForceKnnFactory(embedder=embedder)
ds = DocumentStore(docs=docs, retriever_factory=retriever_factory)

# 2. HTTP queries
query_server = pw.io.http.PathwayWebserver(host="0.0.0.0", port=8012)
class QuerySchema(pw.Schema):
    messages: str

queries, writer = pw.io.http.rest_connector(
    webserver=query_server,
    schema=QuerySchema
)

queries_processed = queries.select(
    query = pw.this.messages,
    k = 3,
    metadata_filter = pw.apply(lambda _: None, pw.this.messages),
    filepath_globpattern = pw.apply(lambda _: None, pw.this.messages)
)

res = ds.retrieve_query(queries_processed)
pw.io.csv.write(res, filename="res_http.csv")
pw.run()
