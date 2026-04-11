import { Router } from "express";
import { addProblemToPlaylist, createPlaylist, deletePlaylist, getPlaylistDetails, removeProblemFromPlayList } from "../controller/playlistController";
import { authorize, isAuthenticated } from "../middleware/authMiddleware";
import { prisma } from "../utils/prismaAdapter";

const routes=Router()


routes.get("/all", authorize("USER","ADMIN"), async (req, res) => {
  const playlists = await prisma.playlist.findMany({
    where: { userId: req.user?.id },
    include: {
      problems: true
    }
  });

  res.json({
    success: true,
    playlists
  });
});
routes.get("/:playlistId",authorize("USER","ADMIN"),getPlaylistDetails)
routes.post("/create-playlist",authorize("USER","ADMIN"),createPlaylist)
routes.post("/:playlistId/add-problem",authorize("USER","ADMIN"),addProblemToPlaylist)
routes.delete("/:playlistId",authorize("USER","ADMIN"),deletePlaylist)
routes.delete("/:playlistId/remove-problem",authorize("USER","ADMIN"),removeProblemFromPlayList)

export default routes