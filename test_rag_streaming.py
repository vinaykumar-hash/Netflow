import pandas as pd
import pathway as pw
from pathway.stdlib.indexing.nearest_neighbors import BruteForceKnnFactory
from pathway.xpacks.llm.document_store import DocumentStore
from pathway.xpacks.llm.embedders import SentenceTransformerEmbedder

class Schema(pw.Schema):
    data: str

# 1. Setup Streaming Data
docs = pw.io.jsonlines.read("test_data.jsonl", schema=Schema, mode="streaming")

embedder = SentenceTransformerEmbedder(model="all-MiniLM-L6-v2")
retriever_factory = BruteForceKnnFactory(embedder=embedder)
ds = DocumentStore(docs=docs, retriever_factory=retriever_factory)

# 2. Setup Query
q = pw.debug.table_from_pandas(pd.DataFrame({"query": ["test"], "k": [1]}))
import pandas as pd # moved up in real script

res = ds.retrieve_query(q)
pw.io.csv.write(res, filename="res_stream.csv")
pw.run()
