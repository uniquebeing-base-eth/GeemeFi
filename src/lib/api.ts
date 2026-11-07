export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    credentials: 'same-origin',
  });

  const data = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new ApiError(data.error ?? 'Something went wrong. Please try again.', response.status);
  return data;
}