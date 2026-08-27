// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ProductErrorPanel } from "@/components/product/ProductErrorPanel"
import type { ProductError } from "@/app/copy"

const error: ProductError = {
  occurrenceId: "occ-1",
  code: "storage.unsupported-version",
  severity: "error",
  scope: "navigation",
  scopeId: "database",
  params: { foundVersion: 3, maximumVersion: 2 },
  primaryAction: { code: "inspect-details", params: {} },
  secondaryAction: null,
  retryable: false,
  technicalCause: null,
}

describe("ProductErrorPanel", () => {
  it("renders one localized scoped occurrence and invokes recovery", async () => {
    const recover = vi.fn()
    render(
      <ProductErrorPanel
        language="vi"
        error={error}
        onPrimaryAction={recover}
      />
    )
    expect(screen.getAllByRole("alert")).toHaveLength(1)
    expect(
      screen.getByText("Phiên bản dữ liệu này không được hỗ trợ")
    ).toBeVisible()
    await userEvent.click(screen.getByRole("button", { name: "Xem chi tiết" }))
    expect(recover).toHaveBeenCalledOnce()
  })
})
