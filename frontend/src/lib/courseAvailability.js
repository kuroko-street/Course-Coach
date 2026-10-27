const missingCourseMessage = /^(?:Course(?: id \d+)? not found\.?|ไม่พบรายวิชา(?:ที่เปิดเผย)?)$/i;

/** Distinguish a vanished course from a missing review, file, or comment. */
export async function isCourseUnavailable(courseId, error, readCourse) {
  if (error?.status !== 404 || !courseId) return false;
  if (missingCourseMessage.test(error.message?.trim() || '')) return true;

  try {
    const course = await readCourse(courseId);
    return Boolean(course?.redirected_from);
  } catch (checkError) {
    return checkError?.status === 404;
  }
}
