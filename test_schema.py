import pathway as pw
import pandas as pd
from pathway.stdlib.indexing.nearest_neighbors import BruteForceKnnFactory
from pathway.xpacks.llm.document_store import DocumentStore
from pathway.xpacks.llm.embedders import SentenceTransformerEmbedder

live_df = pw.debug.table_from_pandas(pd.DataFrame({"data": [b"Network traffic"], "_metadata": [{"path": "live"}]}))
docs = live_df.select(
    data=pw.this.data,
    _metadata=pw.this._metadata
)
embedder = SentenceTransformerEmbedder(model="all-MiniLM-L6-v2")
retriever_factory = BruteForceKnnFactory(embedder=embedder)
ds = DocumentStore(docs=docs, retriever_factory=retriever_factory)

q = pw.debug.table_from_pandas(pd.DataFrame({"query": ["What traffic?"], "k": [1], "metadata_filter": [None], "filepath_globpattern": [None]}))
res = ds.retrieve_query(q)

pw.io.csv.write(q, "q.csv")
pw.io.csv.write(res, "res.csv")
pw.debug.compute_and_print(res)
