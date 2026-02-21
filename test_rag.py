import pathway as pw
import pandas as pd
from pathway.stdlib.indexing.nearest_neighbors import BruteForceKnnFactory
from pathway.xpacks.llm.document_store import DocumentStore
from pathway.xpacks.llm.embedders import SentenceTransformerEmbedder

live_df = pw.debug.table_from_pandas(pd.DataFrame({"data": [b"Sample network flow"]}))
docs = live_df.select(
    data=pw.this.data,
    _metadata=pw.apply(lambda _: {"path": "test"}, pw.this.data)
)
embedder = SentenceTransformerEmbedder(model="all-MiniLM-L6-v2")
retriever_factory = BruteForceKnnFactory(embedder=embedder)

ds = DocumentStore(docs=docs, retriever_factory=retriever_factory)
queries = pw.debug.table_from_pandas(pd.DataFrame({"query": ["What happened?"], "model": ["test"]}))

res = ds.retrieve_query(queries)
final = queries.join_left(res, pw.left.id == pw.right.id).select(*pw.left, pw.right.result)
pw.debug.compute_and_print(final)
