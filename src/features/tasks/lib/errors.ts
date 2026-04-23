export class TaskNotFoundError extends Error {
  readonly code = 'TASK_NOT_FOUND';
  constructor(message = 'タスクが見つかりません') {
    super(message);
    this.name = 'TaskNotFoundError';
  }
}

export class TaskCategoryNotFoundError extends Error {
  readonly code = 'TASK_CATEGORY_NOT_FOUND';
  constructor(message = 'カテゴリが見つかりません') {
    super(message);
    this.name = 'TaskCategoryNotFoundError';
  }
}
