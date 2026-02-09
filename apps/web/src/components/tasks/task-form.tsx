"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface DueObject {
  date: string;
  datetime?: string;
  string?: string;
  isRecurring?: boolean;
  timezone?: string;
  lang?: string;
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

interface TaskFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: TaskData;
}

function dueToDateInput(due?: DueObject): string {
  if (!due) return "";
  return due.date;
}

function dueToTimeInput(due?: DueObject): string {
  if (!due?.datetime) return "";
  // Extract HH:mm from ISO datetime
  const match = due.datetime.match(/T(\d{2}:\d{2})/);
  return match ? match[1]! : "";
}

export function TaskForm({ open, onOpenChange, task }: TaskFormProps) {
  const createTask = useMutation(api.tasks.create);
  const updateTask = useMutation(api.tasks.update);
  const projects = useQuery(api.taskProjects.list);

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<"todo" | "in_progress" | "done">(task?.status ?? "todo");
  const [priority, setPriority] = useState<string>(task?.priority ? String(task.priority) : "");
  const [dueDate, setDueDate] = useState(dueToDateInput(task?.due));
  const [dueTime, setDueTime] = useState(dueToTimeInput(task?.due));
  const [dueString, setDueString] = useState(task?.due?.string ?? "");
  const [isRecurring, setIsRecurring] = useState(task?.due?.isRecurring ?? false);
  const [durationAmount, setDurationAmount] = useState(
    task?.duration ? String(task.duration.amount) : "",
  );
  const [durationUnit, setDurationUnit] = useState<"minute" | "day">(
    task?.duration?.unit ?? "minute",
  );
  const [projectId, setProjectId] = useState<string>(task ? "" : "");
  const [labelsStr, setLabelsStr] = useState(task?.labels?.join(", ") ?? "");

  const isEditing = !!task;

  function buildDueObject(): DueObject | undefined {
    if (!dueDate) return undefined;

    const due: DueObject = { date: dueDate };

    if (dueTime) {
      due.datetime = `${dueDate}T${dueTime}:00`;
    }

    if (dueString.trim()) {
      due.string = dueString.trim();
    }

    if (isRecurring) {
      due.isRecurring = true;
    }

    return due;
  }

  function buildDuration(): { amount: number; unit: "minute" | "day" } | undefined {
    const amount = durationAmount ? Number(durationAmount) : 0;
    if (!amount || amount <= 0) return undefined;
    return { amount, unit: durationUnit };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const labels = labelsStr.trim()
      ? labelsStr
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean)
      : undefined;
    const due = buildDueObject();
    const duration = buildDuration();
    const priorityNum = priority ? Number(priority) : undefined;
    const project =
      projectId && projectId !== "none" ? (projectId as Id<"taskProjects">) : undefined;

    try {
      if (isEditing) {
        await updateTask({
          id: task._id,
          title,
          description: description || undefined,
          status,
          priority: priorityNum,
          due,
          duration,
          labels,
          projectId: project,
        });
        toast.success("Task updated");
      } else {
        await createTask({
          title,
          description: description || undefined,
          status,
          priority: priorityNum,
          due,
          duration,
          labels,
          projectId: project,
        });
        toast.success("Task created");
      }
      onOpenChange(false);
    } catch {
      toast.error(isEditing ? "Failed to update task" : "Failed to create task");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit task" : "New task"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="task-title" className="text-xs">
              Title
            </Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="task-description" className="text-xs">
              Description
            </Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details..."
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-status" className="text-xs">
                Status
              </Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as "todo" | "in_progress" | "done")}
              >
                <SelectTrigger id="task-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">To do</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-priority" className="text-xs">
                Priority
              </Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="task-priority">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Normal</SelectItem>
                  <SelectItem value="2">Medium</SelectItem>
                  <SelectItem value="3">High</SelectItem>
                  <SelectItem value="4">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Due date and time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-due" className="text-xs">
                Due date
              </Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-due-time" className="text-xs">
                Due time
              </Label>
              <Input
                id="task-due-time"
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                disabled={!dueDate}
              />
            </div>
          </div>

          {/* Recurrence */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-recurrence" className="text-xs">
                Recurrence
              </Label>
              <Input
                id="task-recurrence"
                value={dueString}
                onChange={(e) => {
                  setDueString(e.target.value);
                  if (e.target.value.trim()) setIsRecurring(true);
                  else setIsRecurring(false);
                }}
                placeholder="e.g. every monday"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-project" className="text-xs">
                Project
              </Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger id="task-project">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {projects?.map((p) => (
                    <SelectItem key={p._id} value={p._id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-duration" className="text-xs">
                Duration
              </Label>
              <Input
                id="task-duration"
                type="number"
                min={1}
                value={durationAmount}
                onChange={(e) => setDurationAmount(e.target.value)}
                placeholder="Amount"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-duration-unit" className="text-xs">
                Unit
              </Label>
              <Select
                value={durationUnit}
                onValueChange={(v) => setDurationUnit(v as "minute" | "day")}
              >
                <SelectTrigger id="task-duration-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minute">Minutes</SelectItem>
                  <SelectItem value="day">Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="task-labels" className="text-xs">
              Labels
            </Label>
            <Input
              id="task-labels"
              value={labelsStr}
              onChange={(e) => setLabelsStr(e.target.value)}
              placeholder="Comma-separated, e.g. work, urgent"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{isEditing ? "Save" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
