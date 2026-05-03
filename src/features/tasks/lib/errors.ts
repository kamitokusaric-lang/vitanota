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

export class InvalidTagReferenceError extends Error {
  readonly code = 'INVALID_TAG_REFERENCE';
  readonly invalidIds: string[];
  constructor(invalidIds: string[]) {
    super('指定されたタグが見つかりません');
    this.name = 'InvalidTagReferenceError';
    this.invalidIds = invalidIds;
  }
}

export class InvalidAssigneeReferenceError extends Error {
  readonly code = 'INVALID_ASSIGNEE_REFERENCE';
  readonly invalidIds: string[];
  constructor(invalidIds: string[]) {
    super('指定された担当者が見つかりません');
    this.name = 'InvalidAssigneeReferenceError';
    this.invalidIds = invalidIds;
  }
}

export class EmptyAssigneeError extends Error {
  readonly code = 'EMPTY_ASSIGNEE';
  constructor(message = '担当者を 1 名以上選択してください') {
    super(message);
    this.name = 'EmptyAssigneeError';
  }
}
