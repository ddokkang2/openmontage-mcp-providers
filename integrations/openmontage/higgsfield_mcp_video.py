"""OpenMontage video provider backed by the official Higgsfield MCP."""

from tools.video._mcp_video_base import _McpVideoTool


class HiggsfieldMcpVideo(_McpVideoTool):
    name = "higgsfield_mcp_video"
    provider_id = "higgsfield"
    provider = "higgsfield_mcp"
    best_for = ["Higgsfield cinematic video and multimodal generation"]
