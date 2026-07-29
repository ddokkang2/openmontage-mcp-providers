"""OpenMontage video provider backed by the official Kling MCP."""

from tools.video._mcp_video_base import _McpVideoTool


class KlingMcpVideo(_McpVideoTool):
    name = "kling_mcp_video"
    provider_id = "kling"
    provider = "kling_mcp"
    best_for = ["Kling text-to-video and native-audio generation"]
