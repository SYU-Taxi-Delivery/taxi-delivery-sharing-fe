import { postDetailOperations } from "@/features/posts/detail/postDetailApi";
import type { MyHistoryOperations } from "./myHistory";

export class MyHistoryNotConnectedError extends Error {
  constructor() {
    super("내 모집 이력 연동이 아직 준비되지 않았습니다.");
    this.name = "MyHistoryNotConnectedError";
  }
}

/** Replace the list callback when #18 agrees on the history URI and DTO. */
export const myHistoryOperations: MyHistoryOperations = {
  list: async () => {
    throw new MyHistoryNotConnectedError();
  },
  leave: postDetailOperations.leave,
};
