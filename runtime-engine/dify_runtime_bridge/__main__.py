from __future__ import annotations

import json
import sys
from typing import Any

from .runner import inspect_dsl, run_dsl, runtime_status


def _response(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    sys.stdout.flush()


def main() -> int:
    try:
        request = json.load(sys.stdin)
        action = request.get("action")
        if action == "status":
            result = runtime_status()
        elif action == "inspect":
            result = inspect_dsl(str(request.get("dsl") or ""))
        elif action == "run":
            inputs = request.get("inputs") or {}
            profile = request.get("profile")
            if not isinstance(inputs, dict):
                raise ValueError("inputs must be a JSON object.")
            if profile is not None and not isinstance(profile, dict):
                raise ValueError("profile must be a JSON object.")
            result = run_dsl(
                str(request.get("dsl") or ""),
                inputs=inputs,
                profile=profile,
                workflow_id=request.get("workflowId"),
            )
        else:
            raise ValueError(f"Unsupported action: {action}")
        _response({"ok": True, "result": result})
        return 0
    except Exception as error:
        _response({
            "ok": False,
            "error": {
                "type": type(error).__name__,
                "message": str(error),
                "code": getattr(error, "code", None),
                "path": getattr(error, "path", None),
                "details": getattr(error, "details", None),
            },
        })
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
