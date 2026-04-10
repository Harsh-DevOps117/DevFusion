import { Router } from "express";
import { addProblemToPlaylist, createPlaylist, deletePlaylist, getPlaylistDetails, removeProblemFromPlayList } from "../controller/playlistController";
import { isAuthenticated } from "../middleware/authMiddleware";

const routes=Router()


routes.get("/",getPlaylistDetails)
routes.get("/:playlistId",isAuthenticated,getPlaylistDetails)
routes.post("/create-playlist",isAuthenticated,createPlaylist)
routes.post("/:playlistId/add-problem",isAuthenticated,addProblemToPlaylist)
routes.delete("/:playlistId",isAuthenticated,deletePlaylist)
routes.delete("/:playlistId/remove-problem",isAuthenticated,removeProblemFromPlayList)

export default routes