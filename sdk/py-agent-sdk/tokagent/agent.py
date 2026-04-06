"""Agent decorator for Tokamak AI Layer strategies.

The ``@tokagent_agent`` decorator wraps a strategy function so that its
output is validated against the protocol limits before being returned.
"""

from __future__ import annotations

import functools
from typing import Any, Callable

from .types import (
    MAX_ACTION_PAYLOAD_BYTES,
    MAX_ACTIONS_PER_OUTPUT,
    AgentOutput,
)


class AgentValidationError(Exception):
    """Raised when agent output fails validation."""


def _validate_output(output: AgentOutput) -> None:
    """Validate an ``AgentOutput`` against protocol limits.

    Raises ``AgentValidationError`` if:
    - More than 64 actions
    - Any action payload exceeds 16,384 bytes
    - Return type is not ``AgentOutput``
    """
    if not isinstance(output, AgentOutput):
        raise AgentValidationError(
            f"Agent must return AgentOutput, got {type(output).__name__}"
        )

    if len(output.actions) > MAX_ACTIONS_PER_OUTPUT:
        raise AgentValidationError(
            f"Too many actions: {len(output.actions)} (max {MAX_ACTIONS_PER_OUTPUT})"
        )

    for i, action in enumerate(output.actions):
        if len(action.payload) > MAX_ACTION_PAYLOAD_BYTES:
            raise AgentValidationError(
                f"Action {i} payload too large: {len(action.payload)} bytes "
                f"(max {MAX_ACTION_PAYLOAD_BYTES})"
            )


def tokagent_agent(fn: Callable[..., AgentOutput]) -> Callable[..., AgentOutput]:
    """Decorator that wraps a strategy function as a Tokamak agent.

    The decorated function is called normally, and its ``AgentOutput``
    return value is validated before being passed back.

    Example::

        @tokagent_agent
        def my_strategy(ctx: AgentContext, inputs: bytes) -> AgentOutput:
            return AgentOutput(actions=[no_op()])
    """

    @functools.wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> AgentOutput:
        output = fn(*args, **kwargs)
        _validate_output(output)
        return output

    return wrapper
