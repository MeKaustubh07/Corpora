from functools import lru_cache

from langgraph.graph import END, START, StateGraph

from app.agent.nodes import answer, planner, rerank_node, retrieve, should_retry, verify
from app.agent.state import AgentState


@lru_cache
def get_graph():
    g = StateGraph(AgentState)
    g.add_node("planner", planner)
    g.add_node("retrieve", retrieve)
    g.add_node("rerank", rerank_node)
    g.add_node("answer", answer)
    g.add_node("verify", verify)

    g.add_edge(START, "planner")
    g.add_edge("planner", "retrieve")
    g.add_edge("retrieve", "rerank")
    g.add_edge("rerank", "answer")
    g.add_edge("answer", "verify")
    g.add_conditional_edges("verify", should_retry, {"answer": "answer", "__end__": END})
    return g.compile()
