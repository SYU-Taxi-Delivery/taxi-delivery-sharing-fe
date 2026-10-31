import { describe, expect, it } from "vitest";
import { demoPath } from "./demoPaths";

describe("demoPath", () => {
  it.each([
    ["/", "/auth-preview"],
    ["/login", "/auth-preview"],
    ["/signup", "/signup-preview"],
    ["/forgot-password?next=%2Fmy", "/password-reset-preview?next=%2Fmy"],
    ["/reset-password", "/password-reset-preview?mode=reset"],
    ["/posts?type=DELIVERY&page=3", "/posts-preview?type=DELIVERY&page=3"],
    ["/posts/new?type=DELIVERY", "/post-form-preview?type=DELIVERY"],
    ["/posts/preview-1", "/post-detail-preview?postId=preview-1"],
    ["/posts/preview-1/edit", "/post-form-preview?postId=preview-1&mode=edit"],
    ["/my?tab=created", "/my-preview?tab=created"],
    ["/admin", "/admin-preview"],
    ["/posts-preview?page=2", "/posts-preview?page=2"],
    ["https://example.com", "https://example.com"],
    ["#help", "#help"],
  ])("%s를 데모 안에서 연결한다", (source, expected) => {
    expect(demoPath(source)).toBe(expected);
  });
});
