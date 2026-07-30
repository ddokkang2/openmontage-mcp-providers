"""OpenMontage video provider backed by BBANANA AI MCP."""

from tools.video._mcp_video_base import _McpVideoTool


class BbananaMcpVideo(_McpVideoTool):
    name = "bbanana_mcp_video"
    provider_id = "bbanana"
    provider = "bbanana_mcp"
    best_for = ["Explicitly selected multi-model video generation through BBANANA"]
