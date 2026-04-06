import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "@/components/Dashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

function makeFetch(status: number, body: string) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve({}),
  } as unknown as Response);
}

beforeEach(() => {
  const eventSourceMock = { onmessage: null, onerror: null, close: vi.fn() };
  global.EventSource = vi.fn(() => eventSourceMock as unknown as EventSource);
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Backlog refresh button", () => {
  it("renders the Backlog button on desktop", () => {
    global.fetch = makeFetch(200, "{}");
    render(<Dashboard initialSessions={[]} />);
    expect(screen.getByRole("button", { name: /refresh backlog/i })).toBeInTheDocument();
  });

  it("calls GET /api/backlog when clicked", async () => {
    global.fetch = makeFetch(200, "{}");
    render(<Dashboard initialSessions={[]} />);

    const button = screen.getByRole("button", { name: /refresh backlog/i });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/backlog");
  });

  it("shows a success toast when backlog refresh succeeds", async () => {
    global.fetch = makeFetch(200, "{}");
    render(<Dashboard initialSessions={[]} />);

    const button = screen.getByRole("button", { name: /refresh backlog/i });
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      expect(screen.getByText(/backlog refreshed/i)).toBeInTheDocument();
    });
  });

  it("shows an error toast when backlog refresh returns an error status", async () => {
    global.fetch = makeFetch(500, "Internal Server Error");
    render(<Dashboard initialSessions={[]} />);

    const button = screen.getByRole("button", { name: /refresh backlog/i });
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      expect(screen.getByText(/backlog refresh failed/i)).toBeInTheDocument();
    });
  });

  it("shows an error toast on network error", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));
    render(<Dashboard initialSessions={[]} />);

    const button = screen.getByRole("button", { name: /refresh backlog/i });
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      expect(screen.getByText(/network error refreshing backlog/i)).toBeInTheDocument();
    });
  });

  it("disables the button while request is in-flight", async () => {
    let resolveRequest!: (r: Response) => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    global.fetch = vi.fn().mockReturnValue(pendingFetch);

    render(<Dashboard initialSessions={[]} />);

    const button = screen.getByRole("button", { name: /refresh backlog/i });

    // Click without awaiting completion
    act(() => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      expect(button).toBeDisabled();
    });

    // Resolve the fetch and confirm button re-enables
    await act(async () => {
      resolveRequest({
        ok: true,
        status: 200,
        text: () => Promise.resolve("{}"),
        json: () => Promise.resolve({}),
      } as unknown as Response);
    });

    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });
});
