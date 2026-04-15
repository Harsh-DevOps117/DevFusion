import { prisma } from "../utils/prismaAdapter";

export const updateStreak = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) return;

  const now = new Date();

  
  const today = new Date(now.toDateString());

  const lastActive = user.lastActive
    ? new Date(user.lastActive.toDateString())
    : null;

  // First solve
  if (!lastActive) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        currentStreak: 1,
        lastActive: now
      }
    });
    return;
  }

  const diffDays = Math.floor(
    (today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Already solved today
  if (diffDays === 0) {
    return;
  }

  // Continuous streak
  if (diffDays === 1) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        currentStreak: {
          increment: 1
        },
        lastActive: now
      }
    });
    return;
  }

  // Streak broken
  await prisma.user.update({
    where: { id: userId },
    data: {
      currentStreak: 1,
      lastActive: now
    }
  });
};