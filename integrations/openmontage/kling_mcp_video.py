"""OpenMontage video provider backed by the official Kling MCP bridge."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any

from tools.base_tool import (
    BaseTool,
    Determinism,
    ExecutionMode,
    ResourceProfile,
    ToolResult,
    ToolRuntime,
    ToolStability,
    ToolStatus,
    ToolTier,
)


class KlingMcpVideo(BaseTool):
    name = "kling_mcp_video"
    version = "0.1.0"
    tier = ToolTier.GENERATE
    capability = "video_generation"
    provider = "kling_mcp"
    stability = ToolStability.EXPERIMENTAL
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.STOCHASTIC
    runtime = ToolRuntime.API

    dependencies = ["cmd:node"]
    install_instructions = (
        "Clone openmontage-mcp-providers next to OpenMontage, run npm install, "
        "complete Kling MCP OAuth, run `node src/cli.js doctor --provider kling`, "
        "then set OPENMONTAGE_MCP_BRIDGE_CLI when needed."
    )
    agent_skills = ["ai-video-gen"]
    capabilities = ["text_to_video"]
    supports = {
        "text_to_video": True,
        "official_mcp": True,
        "oauth": True,
        "native_audio": True,
        "cost_estimate": False,
    }
    best_for = [
        "official Kling MCP generation without a separately managed API key",
        "OpenMontage cinematic pipeline generated clips",
    ]
    not_good_for = ["offline generation", "jobs without explicit model approval"]
    fallback_tools = []
    side_effects = [
        "submits a paid generation through the official Kling MCP",
        "writes a video file to output_path",
    ]
    user_visible_verification = [
        "Review the generated clip at the assets checkpoint before composition"
    ]
    resource_profile = ResourceProfile(
        cpu_cores=1, ram_mb=512, vram_mb=0, disk_mb=500, network_required=True
    )
    idempotency_key_fields = [
        "prompt",
        "model_name",
        "duration",
        "aspect_ratio",
        "resolution",
        "sound",
    ]

    input_schema = {
        "type": "object",
        "required": ["prompt", "model_name", "output_path"],
        "properties": {
            "prompt": {"type": "string"},
            "model_name": {
                "type": "string",
                "description": "Exact model advertised by the live who_am_i MCP result.",
            },
            "operation": {
                "type": "string",
                "enum": ["text_to_video"],
                "default": "text_to_video",
            },
            "duration": {"type": "string", "default": "5"},
            "aspect_ratio": {
                "type": "string",
                "enum": ["16:9", "9:16", "1:1"],
                "default": "16:9",
            },
            "resolution": {"type": "string", "default": "1080p"},
            "sound": {"type": "string", "enum": ["on", "off"], "default": "off"},
            "prefer_multi_shots": {"type": "boolean", "default": False},
            "output_path": {"type": "string"},
            "timeout_seconds": {"type": "integer", "default": 900},
            "poll_interval": {"type": "number", "default": 10},
        },
    }

    @staticmethod
    def _bridge_cli() -> Path | None:
        configured = os.environ.get("OPENMONTAGE_MCP_BRIDGE_CLI")
        if configured:
            path = Path(configured).expanduser().resolve()
            return path if path.is_file() else None

        openmontage_root = Path(__file__).resolve().parents[2]
        sibling = (
            openmontage_root.parent
            / "openmontage-mcp-providers"
            / "src"
            / "cli.js"
        )
        return sibling if sibling.is_file() else None

    def get_status(self) -> ToolStatus:
        cli = self._bridge_cli()
        if cli is None:
            return ToolStatus.UNAVAILABLE
        configured_state = os.environ.get("OPENMONTAGE_MCP_BRIDGE_STATE")
        receipt = (
            Path(configured_state).expanduser().resolve()
            if configured_state
            else cli.parents[1] / ".state" / "kling.json"
        )
        try:
            state = json.loads(receipt.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return ToolStatus.UNAVAILABLE
        if not (
            state.get("ok") is True
            and state.get("provider") == "kling"
            and state.get("authorization") == "connected"
        ):
            return ToolStatus.UNAVAILABLE
        return super().get_status()

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        return 0.0

    def estimate_runtime(self, inputs: dict[str, Any]) -> float:
        return float(inputs.get("timeout_seconds", 900))

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        cli = self._bridge_cli()
        if cli is None:
            return ToolResult(success=False, error=self.install_instructions)

        output_path = Path(inputs["output_path"]).expanduser().resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        command = [
            "node",
            str(cli),
            "generate",
            "--provider",
            "kling",
            "--model",
            str(inputs["model_name"]),
            "--prompt",
            str(inputs["prompt"]),
            "--duration",
            str(inputs.get("duration", "5")),
            "--aspect-ratio",
            str(inputs.get("aspect_ratio", "16:9")),
            "--resolution",
            str(inputs.get("resolution", "1080p")),
            "--enable-audio",
            str(inputs.get("sound", "off") == "on").lower(),
            "--prefer-multi-shots",
            str(bool(inputs.get("prefer_multi_shots", False))).lower(),
            "--poll-seconds",
            str(inputs.get("poll_interval", 10)),
            "--timeout-seconds",
            str(inputs.get("timeout_seconds", 900)),
            "--output",
            str(output_path),
            "--yes",
        ]
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        if completed.returncode != 0:
            return ToolResult(
                success=False,
                error=completed.stderr.strip() or completed.stdout.strip(),
            )
        try:
            result = json.loads(completed.stdout)
        except json.JSONDecodeError as error:
            return ToolResult(
                success=False,
                error=f"MCP bridge returned invalid JSON: {error}",
            )
        return ToolResult(
            success=True,
            data={
                "path": str(output_path),
                "provider": self.provider,
                "model": inputs["model_name"],
                "generation_id": result.get("generationId"),
                "task_trace_id": result.get("taskTraceId"),
                "source_url": result.get("url"),
            },
        )
