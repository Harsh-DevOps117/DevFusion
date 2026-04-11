import { Router } from "express";
import { addProblemToPlaylist, createPlaylist, deletePlaylist, getPlaylistDetails, removeProblemFromPlayList } from "../controller/playlistController";
import { authorize, isAuthenticated } from "../middleware/authMiddleware";

const routes=Router()


routes.get("/",authorize("USER","ADMIN"),getPlaylistDetails)
routes.get("/:playlistId",authorize("USER","ADMIN"),getPlaylistDetails)
routes.post("/create-playlist",authorize("USER","ADMIN"),createPlaylist)
routes.post("/:playlistId/add-problem",authorize("USER","ADMIN"),addProblemToPlaylist)
routes.delete("/:playlistId",authorize("USER","ADMIN"),deletePlaylist)
routes.delete("/:playlistId/remove-problem",authorize("USER","ADMIN"),removeProblemFromPlayList)

export default routes