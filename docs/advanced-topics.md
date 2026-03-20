# Advanced topics

## Force-restart when deploying

When redeploying a stack the Swarm orchestrator only applies the differences. If a service definition didn't change the service won't be restarted. Sometimes you want a service to restart on every redeploy. The `TIMESTAMP` variable forces this:

```yaml
services:
  always-restart-me:
    build:
      target: $STACK_TARGET
    environment:
      TIMESTAMP:
```

> [!caution]
>
> Only use this for specific cases: debugging startup sequences, testing health checks, or short-running jobs (see below).

## Short-running jobs

Docker Swarm is intended for long-running services. If the orchestrator detects that a service exits immediately it assumes the service failed and will restart it. Here's a pattern for short-running jobs:

1. Your service must remain up long enough for the orchestrator to confirm a successful start. Add a `sleep` before exiting.
2. Combine this with the `TIMESTAMP` trick above. Otherwise redeployments will time out waiting for the stopped service.
3. Use `condition: on-failure` in the restart policy to prevent the orchestrator from restarting after a clean exit.

```yaml
services:
  my-job:
    image: busybox
    entrypoint:
      - /bin/sh
      - -c
      - |
        echo "Running job..."
        echo "Do your thing here"
        sleep 5
        echo "Done."
    environment:
      TIMESTAMP:
    deploy:
      restart_policy:
        condition: on-failure
```

This pattern is ideal for running tasks with `rig exec`. It can also serve as the basis for FaaS-like functionality.

> [!note]
>
> Docker Compose supports `mode: global-job` and `mode: replicated-job` for this use case but these are unsupported in Swarm mode.

## Improve service update times

By default the Swarm orchestrator applies a 5-second delay to check service health. If your service starts faster you can reduce this:

```yaml
services:
  fast-service:
    build:
      target: $STACK_TARGET
    deploy:
      update_config:
        delay: 0s
        monitor: 100ms
```

This helps when deploying with `rig deploy await`.

## Access a service on the cluster

Once a stack is deployed you can access its services via `rig exec`. This is useful for database operations, maintenance tasks, or anything that requires runtime access.

```sh
rig exec my-service sh -c 'echo hello from the cluster'
```

> [!important]
>
> `rig exec` connects to the first container on the cluster belonging to the service. If there are replicas the command will _not_ be executed on each one.

## Storing data on the cluster

You can write anywhere in your container's filesystem but once the container stops the data is lost. For persistent data, always use a volume mount. Make sure that a service using a volume for data storage:

1. Gets deployed to the same node each time (use placement constraints)
2. Isn't replicated

If you don't, you'll end up with split-brain -- the service lands on a different node and the data volume from the previous node isn't there. Target a specific node with placement constraints in `ci.stack.yml`:

```yaml
services:
  database:
    deploy:
      placement:
        constraints:
          - node.labels.index == 0
```

Only define placement constraints in `ci.stack.yml`. Local mode is always single-node.

## Renaming a stack

If you need to rename a stack:

1. Backup any data used by the stack
2. Remove all versions of the stack from the cluster (`rig rm`)
3. Rename the stack in `stack.yml`
4. Redeploy
5. Restore the data

You can see why this is worth avoiding. Think about the name upfront.
