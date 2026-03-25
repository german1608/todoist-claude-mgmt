import { createLogger } from "../utils/logger.js";
import type {
  TodoistTask,
  TodoistProject,
  TodoistSection,
  TodoistComment,
  TodoistLabel,
  CreateTaskParams,
  UpdateTaskParams,
  CreateCommentParams,
  GetTasksParams,
} from "./types.js";

const log = createLogger("TodoistClient");

const BASE_URL = "https://api.todoist.com/rest/v2";

export class TodoistClient {
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  // -----------------------------------------------------------------------
  // HTTP helpers
  // -----------------------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error(`API error: ${method} ${path} → ${response.status}`, {
        status: response.status,
        body: errorText,
      });
      throw new Error(
        `Todoist API error: ${response.status} ${response.statusText} — ${errorText}`,
      );
    }

    // Some endpoints return 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  // -----------------------------------------------------------------------
  // Projects
  // -----------------------------------------------------------------------

  async getProjects(): Promise<TodoistProject[]> {
    return this.request<TodoistProject[]>("GET", "/projects");
  }

  async getProjectByName(name: string): Promise<TodoistProject | undefined> {
    const projects = await this.getProjects();
    return projects.find(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );
  }

  // -----------------------------------------------------------------------
  // Sections
  // -----------------------------------------------------------------------

  async getSections(projectId: string): Promise<TodoistSection[]> {
    return this.request<TodoistSection[]>("GET", "/sections", undefined, {
      project_id: projectId,
    });
  }

  async getSectionByName(
    projectId: string,
    name: string,
  ): Promise<TodoistSection | undefined> {
    const sections = await this.getSections(projectId);
    return sections.find(
      (s) => s.name.toLowerCase() === name.toLowerCase(),
    );
  }

  async createSection(
    projectId: string,
    name: string,
  ): Promise<TodoistSection> {
    return this.request<TodoistSection>("POST", "/sections", {
      project_id: projectId,
      name,
    });
  }

  // -----------------------------------------------------------------------
  // Tasks
  // -----------------------------------------------------------------------

  async getTasks(params?: GetTasksParams): Promise<TodoistTask[]> {
    const query: Record<string, string> = {};
    if (params?.project_id) query["project_id"] = params.project_id;
    if (params?.section_id) query["section_id"] = params.section_id;
    if (params?.label) query["label"] = params.label;
    if (params?.filter) query["filter"] = params.filter;
    if (params?.ids) query["ids"] = params.ids.join(",");

    return this.request<TodoistTask[]>("GET", "/tasks", undefined, query);
  }

  async getTask(taskId: string): Promise<TodoistTask> {
    return this.request<TodoistTask>("GET", `/tasks/${taskId}`);
  }

  async createTask(params: CreateTaskParams): Promise<TodoistTask> {
    return this.request<TodoistTask>("POST", "/tasks", params);
  }

  async updateTask(
    taskId: string,
    params: UpdateTaskParams,
  ): Promise<TodoistTask> {
    return this.request<TodoistTask>("POST", `/tasks/${taskId}`, params);
  }

  async closeTask(taskId: string): Promise<void> {
    await this.request<void>("POST", `/tasks/${taskId}/close`);
  }

  async reopenTask(taskId: string): Promise<void> {
    await this.request<void>("POST", `/tasks/${taskId}/reopen`);
  }

  async moveTask(taskId: string, sectionId: string): Promise<void> {
    await this.request<void>("POST", `/tasks/${taskId}/move`, {
      section_id: sectionId,
    });
  }

  /**
   * Move a task to a different project (optionally into a specific section).
   * If the task is already in the target project, this is a no-op for the project move.
   */
  async moveTaskToProject(
    taskId: string,
    projectId: string,
    sectionId?: string,
  ): Promise<void> {
    const body: Record<string, string> = { project_id: projectId };
    if (sectionId) {
      body["section_id"] = sectionId;
    }
    await this.request<void>("POST", `/tasks/${taskId}/move`, body);
  }

  /**
   * Update a task's labels (replaces all labels).
   * To add a label, merge with existing first.
   */
  async addLabel(taskId: string, label: string): Promise<TodoistTask> {
    const task = await this.getTask(taskId);
    const labels = Array.from(new Set([...task.labels, label]));
    return this.updateTask(taskId, { labels });
  }

  async removeLabel(taskId: string, label: string): Promise<TodoistTask> {
    const task = await this.getTask(taskId);
    const labels = task.labels.filter((l) => l !== label);
    return this.updateTask(taskId, { labels });
  }

  // -----------------------------------------------------------------------
  // Comments
  // -----------------------------------------------------------------------

  async getComments(taskId: string): Promise<TodoistComment[]> {
    return this.request<TodoistComment[]>("GET", "/comments", undefined, {
      task_id: taskId,
    });
  }

  async createComment(params: CreateCommentParams): Promise<TodoistComment> {
    return this.request<TodoistComment>("POST", "/comments", params);
  }

  async postTaskComment(
    taskId: string,
    content: string,
  ): Promise<TodoistComment> {
    return this.createComment({ task_id: taskId, content });
  }

  // -----------------------------------------------------------------------
  // Labels
  // -----------------------------------------------------------------------

  async getLabels(): Promise<TodoistLabel[]> {
    return this.request<TodoistLabel[]>("GET", "/labels");
  }

  async createLabel(name: string, color?: string): Promise<TodoistLabel> {
    const body: Record<string, string> = { name };
    if (color) body["color"] = color;
    return this.request<TodoistLabel>("POST", "/labels", body);
  }

  // -----------------------------------------------------------------------
  // Convenience: ensure project & sections exist
  // -----------------------------------------------------------------------

  async ensureProjectAndSections(
    projectName: string,
    sectionNames: string[],
  ): Promise<{ project: TodoistProject; sections: Map<string, TodoistSection> }> {
    let project = await this.getProjectByName(projectName);
    if (!project) {
      log.info(`Creating project: ${projectName}`);
      project = await this.request<TodoistProject>("POST", "/projects", {
        name: projectName,
      });
    }

    const existingSections = await this.getSections(project.id);
    const sections = new Map<string, TodoistSection>();

    for (const name of sectionNames) {
      let section = existingSections.find(
        (s) => s.name.toLowerCase() === name.toLowerCase(),
      );
      if (!section) {
        log.info(`Creating section: ${name} in project ${projectName}`);
        section = await this.createSection(project.id, name);
      }
      sections.set(name, section);
    }

    return { project, sections };
  }

  // -----------------------------------------------------------------------
  // Convenience: ensure labels exist
  // -----------------------------------------------------------------------

  async ensureLabels(labelNames: string[]): Promise<Map<string, TodoistLabel>> {
    const existing = await this.getLabels();
    const result = new Map<string, TodoistLabel>();

    for (const name of labelNames) {
      let label = existing.find(
        (l) => l.name.toLowerCase() === name.toLowerCase(),
      );
      if (!label) {
        log.info(`Creating label: ${name}`);
        label = await this.createLabel(name);
      }
      result.set(name, label);
    }

    return result;
  }
}
