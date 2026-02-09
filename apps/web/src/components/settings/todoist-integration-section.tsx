"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, Link2, Link2Off, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Unexpected error";
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function TodoistIntegrationSection() {
  const status = useQuery(api.todoist.getConnectionStatus);
  const startOAuth = useMutation(api.todoist.startOAuth);
  const completeOAuth = useMutation(api.todoist.completeOAuth);
  const disconnect = useMutation(api.todoist.disconnect);

  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const callbackHandledRef = useRef(false);
  const errorHandledRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");
    const errorDescription = params.get("error_description");
    const isTodoistCallback = Boolean(state?.startsWith("todoist_"));

    if (error && isTodoistCallback && !errorHandledRef.current) {
      errorHandledRef.current = true;
      toast.error(errorDescription ? safeDecode(errorDescription) : "Todoist connection failed");
      window.history.replaceState({}, "", "/settings");
      return;
    }

    if (!code || !state || !isTodoistCallback || callbackHandledRef.current) return;

    callbackHandledRef.current = true;
    setIsConnecting(true);

    void completeOAuth({ code, state })
      .then(() => {
        toast.success("Todoist connected successfully");
        window.history.replaceState({}, "", "/settings");
      })
      .catch((error) => {
        toast.error(`Failed to complete Todoist connection: ${getErrorMessage(error)}`);
        window.history.replaceState({}, "", "/settings");
      })
      .finally(() => {
        setIsConnecting(false);
      });
  }, [completeOAuth]);

  async function handleConnect() {
    setIsConnecting(true);
    try {
      const { authorizationUrl } = await startOAuth({});
      window.location.assign(authorizationUrl);
    } catch (error) {
      setIsConnecting(false);
      toast.error(`Failed to start Todoist connection: ${getErrorMessage(error)}`);
    }
  }

  async function handleDisconnect() {
    setIsDisconnecting(true);
    try {
      await disconnect({});
      toast.success("Todoist disconnected");
    } catch (error) {
      toast.error(`Failed to disconnect Todoist: ${getErrorMessage(error)}`);
    } finally {
      setIsDisconnecting(false);
    }
  }

  const isLoading = status === undefined;
  const isConnected = Boolean(status?.connected);

  return (
    <div>
      <div className="border-border flex items-center justify-between rounded-lg border p-3">
        <div className="flex items-center gap-3">
          <div className="bg-muted flex size-8 items-center justify-center rounded-full">
            <CheckCircle2 className="size-4 text-red-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Todoist</span>
              {isLoading ? null : isConnected ? (
                <Badge
                  variant="outline"
                  className="border-green-500/30 bg-green-500/10 text-xs text-green-600 dark:text-green-400"
                >
                  Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs">
                  Not connected
                </Badge>
              )}
            </div>
            {isConnected && (status?.accountEmail || status?.accountName) ? (
              <p className="text-muted-foreground text-xs">
                {status.accountName ?? status.accountEmail}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                Use your Todoist account for planning workflows.
              </p>
            )}
          </div>
        </div>

        {isConnected ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            disabled={isDisconnecting || isConnecting}
          >
            {isDisconnecting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Link2Off className="size-4" />
            )}
            Disconnect
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleConnect}
            disabled={isLoading || isConnecting}
          >
            {isConnecting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Link2 className="size-4" />
            )}
            Connect
          </Button>
        )}
      </div>
    </div>
  );
}
