"""
Stitch MCP wrapper - forwards to official Stitch API (https://stitch.googleapis.com/mcp).
Schema-aligned: project refs as projects/{id}, improved error handling.
"""
import os
import sys
import requests
import json
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Stitch")
API_KEY = os.environ.get("STITCH_API_KEY")
ENDPOINT = "https://stitch.googleapis.com/mcp"


def _normalize_project_ref(project_id_or_name):
    """Ensure project reference is in 'projects/{id}' format for Stitch API."""
    if not project_id_or_name:
        return None
    s = str(project_id_or_name).strip()
    if s.startswith("projects/"):
        return s
    return f"projects/{s}"


def call_stitch_mcp(method, params=None):
    """Send JSON-RPC to Stitch API. Returns result dict or error message."""
    if not API_KEY:
        return {"error": "STITCH_API_KEY is not set."}

    headers = {
        "X-Goog-Api-Key": API_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "jsonrpc": "2.0",
        "method": method,
        "params": params or {},
        "id": "1",
    }
    try:
        response = requests.post(ENDPOINT, json=payload, headers=headers, timeout=60)
        response.raise_for_status()
        data = response.json()
        if "error" in data:
            err = data["error"]
            msg = err.get("message", "Unknown error")
            code = err.get("code", -1)
            return {"error": msg, "code": code}
        return data.get("result")
    except requests.exceptions.RequestException as e:
        return {"error": f"Connection error: {str(e)}"}
    except Exception as e:
        return {"error": str(e)}


@mcp.tool()
def list_projects(filter_str: str = None):
    """List all Stitch projects accessible to the user."""
    args = {"filter": filter_str} if filter_str else {}
    return call_stitch_mcp("tools/call", {"name": "list_projects", "arguments": args})


@mcp.tool()
def create_project(title: str = None):
    """Creates a new Stitch project."""
    args = {"title": title} if title else {}
    return call_stitch_mcp("tools/call", {"name": "create_project", "arguments": args})


@mcp.tool()
def generate_screen_from_text(
    parent: str,
    prompt: str,
    deviceType: str = "MOBILE",
    modelId: str = "GEMINI_1_5_FLASH",
):
    """
    Generates a new screen within a project from a text prompt.
    parent: project ID or 'projects/{id}' (will be normalized to projects/{id}).
    deviceType: MOBILE, DESKTOP, TABLET, AGNOSTIC.
    modelId: GEMINI_1_5_FLASH, GEMINI_1_5_PRO, or GEMINI_2_0_FLASH if supported.
    """
    project_ref = _normalize_project_ref(parent)
    if not project_ref:
        return {"error": "parent (project id) is required."}
    args = {
        "parent": project_ref,
        "prompt": prompt,
        "deviceType": deviceType,
        "modelId": modelId,
    }
    return call_stitch_mcp("tools/call", {"name": "generate_screen_from_text", "arguments": args})


@mcp.tool()
def get_project(name: str):
    """Retrieves a project by ID. name should be 'projects/{id}' or numeric id."""
    ref = _normalize_project_ref(name) if name else None
    if not ref:
        return {"error": "name (project id) is required."}
    return call_stitch_mcp("tools/call", {"name": "get_project", "arguments": {"name": ref}})


@mcp.tool()
def get_screen(projectId: str, screenId: str):
    """Retrieves the details of a specific screen within a project."""
    ref = _normalize_project_ref(projectId)
    if not ref:
        return {"error": "projectId is required."}
    return call_stitch_mcp(
        "tools/call",
        {"name": "get_screen", "arguments": {"projectId": ref, "screenId": screenId}},
    )


@mcp.tool()
def list_screens(projectId: str):
    """Lists all screens within a given Stitch project."""
    ref = _normalize_project_ref(projectId)
    if not ref:
        return {"error": "projectId is required."}
    return call_stitch_mcp(
        "tools/call",
        {"name": "list_screens", "arguments": {"projectId": ref}},
    )


if __name__ == "__main__":
    mcp.run()
