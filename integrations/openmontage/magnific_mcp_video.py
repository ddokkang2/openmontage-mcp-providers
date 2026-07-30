"""OpenMontage video provider backed by the official Magnific MCP."""

from tools.video._mcp_video_base import _McpVideoTool


class MagnificMcpVideo(_McpVideoTool):
    name = "magnific_mcp_video"
    provider_id = "magnific"
    provider = "magnific_mcp"
    best_for = ["Magnific video generation and image-to-finish workflows"]
