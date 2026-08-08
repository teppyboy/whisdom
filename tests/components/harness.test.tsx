// @vitest-environment jsdom
import "fake-indexeddb/auto"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

describe("component harness", () => {
  it("provides DOM matchers and isolated IndexedDB", () => {
    render(<main aria-label="Harness">Ready</main>)
    expect(screen.getByRole("main", { name: "Harness" })).toBeInTheDocument()
    expect(indexedDB).toBeDefined()
  })
})
