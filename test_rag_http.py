import pathway as pw
import pandas as pd
from pathway.stdlib.indexing.nearest_neighbors import BruteForceKnnFactory
from pathway.xpacks.llm.document_store import DocumentStore
from pathway.xpacks.llm.embedders import SentenceTransformerEmbedder

# 1. Setup Data (Simulate grouped/windowed IDs)
df = pd.DataFrame({"data": [b"Hello"], "key": [1]})
t = pw.debug.table_from_pandas(df)
static_docs = t.groupby(pw.this.key).reduce(data=pw.this.data[0]).select(data=pw.this.data)
# static_docs = pw.debug.table_from_pandas(static_df).select(data=pw.this.data)

embedder = SentenceTransformerEmbedder(model="all-MiniLM-L6-v2")
retriever_factory = BruteForceKnnFactory(embedder=embedder)
ds = DocumentStore(docs=static_docs, retriever_factory=retriever_factory)

# 2. Setup Query Table (Simulate HTTP)
class QuerySchema(pw.Schema):
    messages: str

# Use a debug table instead of http to see if it still panics
q_df = pd.DataFrame({"messages": ["Hello"], "id": [0], "_metadata": [{"modified_at": 0, "seen_at": 0}]})
queries = pw.debug.table_from_pandas(q_df)

queries_processed = queries.select(
    query = pw.this.messages,
    k = 3,
    metadata_filter = None,
    filepath_globpattern = None
)

res = ds.retrieve_query(queries_processed)
# pw.debug.compute_and_print(res)
pw.io.csv.write(res, filename="res.csv")
pw.run()
