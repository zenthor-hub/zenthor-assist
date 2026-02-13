"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { T, useGT } from "gt-next";
import { CheckSquare, Circle, Clock, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import Loader from "@/components/loader";
import { PageWrapper } from "@/components/page-wrapper";
import { TaskForm } from "@/components/tasks/task-form";
import { Button } from "@/components/ui/button";

type FilterTab = "all" | "active" | "done";

// Todoist-aligned: 1=normal, 2=medium, 3=high, 4=urgent
const PRIORITY_COLORS: Record<number, string> = {
  1: "bg-gray-400",
  2: "bg-blue-500",
  3: "bg-orange-500",
  4: "bg-red-500",
};

interface DueObject {
  date: string;
  datetime?: string;
  string?: string;
  isRecurring?: boolean;
  timezone?: string;
  lang?: string;
}

function formatRelativeDue(
  t: (key: string) => string,
  due: DueObject,
): { text: string; overdue: boolean; hasTime: boolean } {
  const dueMs = due.datetime
    ? new Date(due.datetime).getTime()
    : new Date(`${due.date}T00:00:00`).getTime();
  const now = Date.now();
  const diff = dueMs - now;
  const overdue = diff < 0;
  const absDays = Math.abs(Math.round(diff / 86_400_000));
  const hasTime = !!due.datetime;

  let text: string;

  if (absDays === 0) {
    if (hasTime) {
      const time = new Date(due.datetime!).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
      text = `${t("Today")} ${time}`;
    } else {
      text = t("Today");
    }
    return { text, overdue: false, hasTime };
  }

  if (absDays === 1 && !overdue) {
    if (hasTime) {
      const time = new Date(due.datetime!).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
      text = `${t("Tomorrow")} ${time}`;
    } else {
      text = t("Tomorrow");
    }
    return { text, overdue: false, hasTime };
  }

  if (absDays === 1 && overdue) return { text: t("Yesterday"), overdue: true, hasTime };

  if (absDays < 7) {
    text = overdue ? `${absDays}${t("d ago")}` : `${t("In")} ${absDays}${t("d")}`;
    return { text, overdue, hasTime };
  }

  const dateText = new Date(dueMs).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  if (hasTime) {
    const time = new Date(due.datetime!).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    text = `${dateText} ${time}`;
  } else {
    text = dateText;
  }
  return { text, overdue, hasTime };
}

interface TaskData {
  _id: Id<"tasks">;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done";
  priority?: number;
  due?: DueObject;
  dueAt?: number;
  labels?: string[];
  duration?: { amount: number; unit: "minute" | "day" };
}

export default function TasksPage() {
  const t = useGT();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskData | undefined>();
  const [quickAddTitle, setQuickAddTitle] = useState("");

  const statusFilter =
    filter === "active" ? undefined : filter === "done" ? ("done" as const) : undefined;

  const tasks = useQuery(api.tasks.list, statusFilter ? { status: statusFilter } : {});
  const createTask = useMutation(api.tasks.create);
  const toggleComplete = useMutation(api.tasks.toggleComplete);
  const removeTask = useMutation(api.tasks.remove);

  if (tasks === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader />
      </div>
    );
  }

  // Client-side filter for "active" (exclude done)
  const filteredTasks = filter === "active" ? tasks.filter((t) => t.status !== "done") : tasks;

  function handleEdit(task: TaskData) {
    setEditingTask(task);
    setFormOpen(true);
  }

  function handleAdd() {
    setEditingTask(undefined);
    setFormOpen(true);
  }

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = quickAddTitle.trim();
    if (!title) return;

    try {
      await createTask({ title });
      setQuickAddTitle("");
      toast.success(t("Task added"));
    } catch {
      toast.error(t("Failed to add task"));
    }
  }

  async function handleToggle(taskId: Id<"tasks">) {
    try {
      await toggleComplete({ id: taskId });
    } catch {
      toast.error(t("Failed to update task"));
    }
  }

  async function handleDelete(e: React.MouseEvent, taskId: Id<"tasks">) {
    e.stopPropagation();
    try {
      await removeTask({ id: taskId });
      toast.success(t("Task deleted"));
    } catch {
      toast.error(t("Failed to delete task"));
    }
  }

  return (
    <PageWrapper
      title={<T>Tasks</T>}
      actions={
        <Button size="sm" onClick={handleAdd}>
          <Plus className="size-4" />
          <T>New task</T>
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        {/* Filter tabs */}
        <div className="flex items-center gap-1">
          {(
            [
              { value: "all", label: t("All") },
              { value: "active", label: t("Active") },
              { value: "done", label: t("Done") },
            ] as const
          ).map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setFilter(tab.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                filter === tab.value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Quick add */}
        <form onSubmit={handleQuickAdd}>
          <div className="flex items-center gap-2 rounded-lg border px-4 py-3">
            <Plus className="text-muted-foreground size-4 shrink-0" />
            <input
              type="text"
              value={quickAddTitle}
              onChange={(e) => setQuickAddTitle(e.target.value)}
              placeholder={t("Add a task...")}
              className="placeholder:text-muted-foreground flex-1 bg-transparent text-sm outline-none"
            />
          </div>
        </form>

        {/* Task list */}
        {filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border py-12">
            <CheckSquare className="text-muted-foreground size-8" />
            <p className="text-sm font-medium">
              <T>No tasks yet</T>
            </p>
            <p className="text-muted-foreground text-xs">
              <T>Create your first task or ask the assistant</T>
            </p>
          </div>
        ) : (
          <div className="divide-border divide-y rounded-lg border">
            {filteredTasks.map((task) => {
              const isDone = task.status === "done";
              const due = task.due ? formatRelativeDue(t, task.due) : null;

              return (
                <div key={task._id} className="group flex items-center gap-3 px-4 py-3">
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={() => handleToggle(task._id)}
                    className="flex shrink-0 items-center justify-center"
                  >
                    {isDone ? (
                      <CheckSquare className="text-muted-foreground size-4" />
                    ) : (
                      <Circle className="text-muted-foreground size-4" />
                    )}
                  </button>

                  {/* Priority dot */}
                  {task.priority && task.priority > 1 && (
                    <span
                      className={`size-2 shrink-0 rounded-full ${PRIORITY_COLORS[task.priority] ?? "bg-gray-400"}`}
                    />
                  )}

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => handleEdit(task as TaskData)}
                      className={`text-left text-xs font-medium ${isDone ? "text-muted-foreground line-through" : ""}`}
                    >
                      {task.title}
                    </button>
                  </div>

                  {/* Duration badge */}
                  {task.duration && (
                    <span className="text-muted-foreground flex shrink-0 items-center gap-0.5 text-[10px]">
                      <Clock className="size-2.5" />
                      {task.duration.amount}
                      {task.duration.unit === "minute" ? <T>m</T> : <T>d</T>}
                    </span>
                  )}

                  {/* Labels */}
                  {task.labels && task.labels.length > 0 && (
                    <div className="flex shrink-0 items-center gap-1">
                      {task.labels.map((label) => (
                        <span
                          key={label}
                          className="bg-muted rounded-full px-1.5 py-0.5 text-[10px]"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Due date */}
                  {due && (
                    <span
                      className={`flex shrink-0 items-center gap-1 text-[10px] ${due.overdue ? "text-red-500" : "text-muted-foreground"}`}
                    >
                      {task.due?.isRecurring && <Repeat className="size-2.5" />}
                      {due.text}
                    </span>
                  )}

                  {/* Hover actions */}
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleEdit(task as TaskData)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => handleDelete(e, task._id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <TaskForm
        key={editingTask?._id ?? "new"}
        open={formOpen}
        onOpenChange={setFormOpen}
        task={editingTask}
      />
    </PageWrapper>
  );
}
