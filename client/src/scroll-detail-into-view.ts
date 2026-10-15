/** After expand, scroll so detail content sits at the top of the viewport. */
export function scrollDetailIntoView(node: HTMLElement | null | undefined) {
  if (!node) {
    return;
  }
  requestAnimationFrame(() => {
    node.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

export function studentDetailElementId(studentId: string) {
  return `vbs-student-detail-${studentId}`;
}

export function orgMemberFocusElementId(username: string) {
  return `org-member-${username}`;
}
