import { string, success } from "zod";
import { prisma } from "../utils/prismaAdapter";
import { createPlaylistSchema } from "../utils/validations";
import type { Request, Response } from "express";
import logger from "../utils/logger";

export const createPlaylist = async (req: Request, res: Response) => {
    try {
        const result = createPlaylistSchema.safeParse(req.body)
        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: result.error.flatten()
            })
        }
        const { name, description } = req.body;


        const playlist = await prisma.playlist.create({
            data: {
                name,
                description,
                userId: req.user?.id as string
            }
        })

        res.status(200).json({
            success: true,
            message: "Playlist Created",
            playlist
        })
    } catch (error) {
        logger.error('Error in creating playlist ', error);
        res.status(500).json({ error: 'Failed to create playlist' });
    }
}

export const addProblemToPlaylist = async (req: Request, res: Response) => {
    const { playlistId } = req.params;
    const { problemIds } = req.body;
    if (typeof playlistId != "string") {
        return res.status(400).json({
            success: false,
            message: "invalid PlaylistId",
        })
    }
    try {

        if (!Array.isArray(problemIds) || problemIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid or missing problemIds",
            });
        }

        const problemInPlaylist = await prisma.problemInPlaylist.createMany({
            data: problemIds.map((problemId) => ({
                playlistId: playlistId,
                problemId,
            })),
            skipDuplicates: true,
        });

        return res.status(201).json({
            success: true,
            message: "Problems added to playlist successfully",

        });
    } catch (error) {
        logger.error("Error adding problem in playlist:", error);

        return res.status(500).json({
            success: false,
            message: "Error adding problem in playlist",
        });
    }
};

export const deletePlaylist = async (req: Request, res: Response) => {
  const { playlistId } = req.params;
 

  if (typeof playlistId !== "string") {
    return res.status(400).json({
      success: false,
      message: "Invalid playlistId",
    });
  }

  try {
    const deletedPlaylist = await prisma.playlist.delete({
      where: {
        id: playlistId,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Playlist deleted successfully",
      deletedPlaylist,
    });

  } catch (error: any) {
    logger.error("Error deleting playlist:", error.message);

    

    return res.status(500).json({
      success: false,
      message: "Failed to delete playlist",
    });
  }
};

export const removeProblemFromPlayList = async (req: Request, res: Response) => {
    const { playlistId } = req.params
    const { problemIds } = req.body
    if (typeof playlistId != "string") {
        return res.status(400).json({
            success: false,
            message: "invalid PlaylistId",
        })
    }

    try {

        if (!Array.isArray(problemIds) || problemIds.length === 0) {
            return res.status(400).json({ error: "Invalid  or missing problemId" })
        }
        const deletedProblem = await prisma.problemInPlaylist.deleteMany({
            where: {
                playlistId: playlistId,
                problemId: {
                    in: problemIds
                }
            }
        })
    } catch (error) {
        logger.error("Error in removinf problem from playlist:", error)
        res.status(500).json({
            error: "Failed to remove problem"
        })
    }
}

export const getPlaylistDetails = async (req: Request, res: Response) => {
    const { playlistId } = req.params
    if (typeof playlistId != "string") {
        return res.status(400).json({
            success: false,
            message: "invalid PlaylistId",
        })
    }

    try {

        const playlist = await prisma.playlist.findUnique({
            where: {
                id: playlistId,
                userId: req.user?.id
            },
            include: {
                problems: {
                    include: {
                        problem: true
                    }
                }
            }
        })

        if (!playlist) {
            return res.status(404).json({
                error: "Playlist not found"
            })
        }

        res.status(200).json({
            success: true,
            message: "Playlsit fetched successfully",
            playlist
        })

    } catch (error) {
        logger.error('Error in fetching playlist ', error);
        res.status(500)
            .json({ error: 'Failed to create playlist ' });
    }
}

