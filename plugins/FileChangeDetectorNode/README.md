# FileChangeDetector Node

The **FileChangeDetector** node allows FlowX2 workflows to pause and await filesystem events asynchronously. It directly integrates with the operating system's file events via the `watchdog` library while remaining strictly non-blocking to the Push-Based Async Engine.

## Features

- **Asynchronous Halting**: Pauses execution without locking the event loop.
- **Event Masking**: Filter events by type: `created`, `modified`, or `deleted`.
- **Variable Interpolation**: Dynamically set the `Watch Path` using execution context variables like `{{inputs.start.path}}`.
- **Timeouts**: Define a maximum wait period before the node yields a failure. Set to `0` for infinite waiting.
- **Thread Security**: Cross-thread communication between the engine and the OS `watchdog` thread is rigorously locked to prevent pipeline crashes during rapid filesystem I/O.

## Wait Strategy Configuration

- **Inputs**: Requires standard trigger connections just like other nodes. Usually placed after a `CommandNode` that kicks off a background task that manipulates files.
- **Outputs**: Pushes the dictionary payload `{"file_path": "/path/to/detected.txt", "event": "modified"}` into the next node's inbox.

### Important Note
When the FlowX engine restarts or shuts down, the underlying `FileWatchManager` gracefully terminates all background OS threads to ensure no memory bloat occurs.
