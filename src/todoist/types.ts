// ---------------------------------------------------------------------------
// Todoist REST API v1 type definitions
// https://developer.todoist.com/rest/v2/
// ---------------------------------------------------------------------------

export interface TodoistTask {
  id: string;
  content: string;
  description: string;
  project_id: string;
  section_id: string | null;
  parent_id: string | null;
  order: number;
  priority: 1 | 2 | 3 | 4;
  labels: string[];
  due: TodoistDue | null;
  is_completed: boolean;
  comment_count: number;
  creator_id: string;
  created_at: string;
  assignee_id: string | null;
  assigner_id: string | null;
  url: string;
}

export interface TodoistDue {
  date: string;
  string: string;
  lang: string;
  is_recurring: boolean;
  datetime?: string;
  timezone?: string;
}

export interface TodoistProject {
  id: string;
  name: string;
  comment_count: number;
  order: number;
  color: string;
  is_shared: boolean;
  is_favorite: boolean;
  parent_id: string | null;
  is_inbox_project: boolean;
  is_team_inbox: boolean;
  view_style: string;
  url: string;
}

export interface TodoistSection {
  id: string;
  project_id: string;
  order: number;
  name: string;
}

export interface TodoistComment {
  id: string;
  task_id?: string;
  project_id?: string;
  content: string;
  posted_at: string;
  attachment?: TodoistAttachment;
}

export interface TodoistAttachment {
  file_name: string;
  file_type: string;
  file_url: string;
  resource_type: string;
}

export interface TodoistLabel {
  id: string;
  name: string;
  color: string;
  order: number;
  is_favorite: boolean;
}

// ---------------------------------------------------------------------------
// API request types
// ---------------------------------------------------------------------------

export interface CreateTaskParams {
  content: string;
  description?: string;
  project_id?: string;
  section_id?: string;
  parent_id?: string;
  order?: number;
  labels?: string[];
  priority?: 1 | 2 | 3 | 4;
  due_string?: string;
  due_date?: string;
  due_datetime?: string;
  due_lang?: string;
  assignee_id?: string;
}

export interface UpdateTaskParams {
  content?: string;
  description?: string;
  labels?: string[];
  priority?: 1 | 2 | 3 | 4;
  due_string?: string;
  due_date?: string;
  due_datetime?: string;
  due_lang?: string;
  assignee_id?: string;
}

export interface CreateCommentParams {
  task_id?: string;
  project_id?: string;
  content: string;
}

export interface GetTasksParams {
  project_id?: string;
  section_id?: string;
  label?: string;
  filter?: string;
  ids?: string[];
}

// ---------------------------------------------------------------------------
// Internal dispatcher types
// ---------------------------------------------------------------------------

export type TaskType = "coding" | "pr-monitor" | "unknown";

export interface DispatchableTask {
  todoistTask: TodoistTask;
  taskType: TaskType;
  repoUrl?: string;
  branch?: string;
  prUrl?: string;
  prNumber?: number;
  platform?: "github" | "ado";
}
