/**
 * Rebuilds the queue against the current members of the storyteller role.
 * Existing members keep their relative order (position matters — it's the
 * whole point of the queue). New role members are added to the top, so
 * they're asked before anyone already in the rotation.
 * Members who no longer have the role are dropped.
 */
function syncQueueWithRole(currentQueue, roleMemberIds) {
  const roleSet = new Set(roleMemberIds);
  const kept = currentQueue.filter((id) => roleSet.has(id));
  const keptSet = new Set(kept);
  const added = roleMemberIds.filter((id) => !keptSet.has(id));
  return {
    queue: [...added, ...kept],
    added,
    removed: currentQueue.filter((id) => !roleSet.has(id)),
  };
}

function moveToBottom(queue, userId) {
  const rest = queue.filter((id) => id !== userId);
  return [...rest, userId];
}

function moveToFront(queue, userId) {
  const rest = queue.filter((id) => id !== userId);
  return [userId, ...rest];
}

/**
 * Moves a user delta positions through the queue (negative = toward the
 * front/sooner, positive = toward the back/later), clamped to the ends.
 * No-op if the user isn't in the queue.
 */
function moveByOffset(queue, userId, delta) {
  const index = queue.indexOf(userId);
  if (index === -1) return queue;
  const targetIndex = Math.max(0, Math.min(queue.length - 1, index + delta));
  if (targetIndex === index) return queue;
  const next = [...queue];
  next.splice(index, 1);
  next.splice(targetIndex, 0, userId);
  return next;
}

/**
 * Picks who to ask next this round. Prefers someone who hasn't been asked
 * yet. If everyone in the queue has already been asked at least once and
 * slots are still open, falls back to re-asking people who already hold a
 * slot — so one person can end up covering multiple slots when nobody else
 * is left — skipping anyone who explicitly passed or couldn't be reached
 * this round either way. Snoozed users (see /clear-snooze) are excluded
 * entirely, overriding everything else, until their snooze expires.
 */
function nextCandidate(queue, round, snoozedUntil = {}, now = Date.now()) {
  const ineligible = new Set(round.ineligibleThisRound);
  const asked = new Set(round.askedThisRound);
  const isSnoozed = (id) => (snoozedUntil[id] ?? 0) > now;

  const fresh = queue.find((id) => !asked.has(id) && !ineligible.has(id) && !isSnoozed(id));
  if (fresh) return fresh;

  const filledUserIds = new Set(round.filled.map((f) => f.userId));
  return queue.find((id) => filledUserIds.has(id) && !ineligible.has(id) && !isSnoozed(id)) || null;
}

module.exports = { syncQueueWithRole, moveToBottom, moveToFront, moveByOffset, nextCandidate };
