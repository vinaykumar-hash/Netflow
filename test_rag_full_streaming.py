import pathway as pw
import pandas as pd
from pathway.stdlib.indexing.nearest_neighbors import BruteForceKnnFactory
from pathway.xpacks.llm.document_store import DocumentStore
from pathway.xpacks.llm.embedders import SentenceTransformerEmbedder

class DocSchema(pw.Schema):
    data: str

class QuerySchema(pw.Schema):
    query: str
    k: int
    metadata_filter: str | None
    filepath_globpattern: str | None

# 1. Setup Streaming Docs
docs = pw.io.jsonlines.read("test_data.jsonl", schema=DocSchema, mode="streaming")

embedder = SentenceTransformerEmbedder(model="all-MiniLM-L6-v2")
retriever_factory = BruteForceKnnFactory(embedder=embedder)
ds = DocumentStore(docs=docs, retriever_factory=retriever_factory)

# 2. Setup Streaming Queries
queries = pw.io.jsonlines.read("test_queries.jsonl", schema=QuerySchema, mode="streaming")

res = ds.retrieve_query(queries)
pw.io.csv.write(res, filename="res_full_stream.csv")
pw.run()
