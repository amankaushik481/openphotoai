/**
 * In-memory stand-in for the `replicate` SDK. Test files wire it up with:
 *   vi.mock("replicate", async () => (await import("./fake-replicate")).replicateModule);
 */
import { vi } from "vitest";

interface Page<T> {
  results: T[];
  next?: string;
}

export const fake = {
  constructed: [] as Record<string, unknown>[],
  predictions: { create: vi.fn(), get: vi.fn(), cancel: vi.fn() },
  trainings: { create: vi.fn(), get: vi.fn(), cancel: vi.fn() },
  models: { get: vi.fn(), create: vi.fn(), versions: { list: vi.fn() } },
  files: { create: vi.fn() },
  run: vi.fn(),
  request: vi.fn(),
};

class FakeReplicate {
  predictions = fake.predictions;
  trainings = fake.trainings;
  models = fake.models;
  files = fake.files;
  run = fake.run;
  request = fake.request;

  constructor(options: Record<string, unknown>) {
    fake.constructed.push(options);
  }

  async *paginate<T>(endpoint: () => Promise<Page<T>>): AsyncGenerator<T[]> {
    let page = await endpoint();
    yield page.results;
    while (page.next) {
      const res = (await fake.request(page.next, { method: "GET" })) as { json(): Promise<Page<T>> };
      page = await res.json();
      yield page.results;
    }
  }
}

export const replicateModule = { default: FakeReplicate };

export function resetFake(): void {
  fake.constructed.length = 0;
  for (const fn of [
    fake.predictions.create,
    fake.predictions.get,
    fake.predictions.cancel,
    fake.trainings.create,
    fake.trainings.get,
    fake.trainings.cancel,
    fake.models.get,
    fake.models.create,
    fake.models.versions.list,
    fake.files.create,
    fake.run,
    fake.request,
  ]) {
    fn.mockReset();
  }
  let n = 0;
  fake.predictions.create.mockImplementation(async () => ({ id: `pred${++n}`, status: "starting" }));
  fake.predictions.cancel.mockImplementation(async (id: string) => ({ id, status: "canceled" }));
}

/** Mimics the SDK's ApiError (an Error carrying the HTTP response). */
export function apiError(status: number, text = ""): Error {
  return Object.assign(new Error(`Request failed with status ${status}: ${text}`), {
    name: "ApiError",
    response: { status },
  });
}

/** Input object of the n-th `predictions.create` call. */
export function createdInput(n = 0): Record<string, unknown> {
  const call = fake.predictions.create.mock.calls[n];
  if (!call) throw new Error(`predictions.create was not called ${n + 1} time(s)`);
  return (call[0] as { input: Record<string, unknown> }).input;
}

export function createdOptions(n = 0): Record<string, unknown> {
  const call = fake.predictions.create.mock.calls[n];
  if (!call) throw new Error(`predictions.create was not called ${n + 1} time(s)`);
  return call[0] as Record<string, unknown>;
}
