"""Coalesce slider edits into one pending request and one in-flight callback."""
import asyncio
import time


class LatestRequestRunner:
    def __init__(self, callback, delay_seconds=0.):
        self.callback = callback
        self.delay_seconds = delay_seconds
        self.pending = False
        self.due = 0.
        self.task = None

    def submit(self, immediate=False):
        self.pending = True
        self.due = time.monotonic() + (0. if immediate else self.delay_seconds)
        if self.task is None or self.task.done():
            self.task = asyncio.ensure_future(self._run())

    def cancel_pending(self):
        # Do not cancel a running HTTP thread. Its revision check discards old data.
        self.pending = False

    async def wait_idle(self):
        while self.task is not None:
            task = self.task
            await asyncio.shield(task)

    async def _run(self):
        try:
            while self.pending:
                remaining = self.due-time.monotonic()
                if remaining > 0:
                    await asyncio.sleep(min(remaining, .05))
                    continue
                self.pending = False
                await self.callback()
        finally:
            self.task = None
