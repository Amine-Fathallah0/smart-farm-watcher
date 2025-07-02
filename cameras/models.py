# cameras/models.py

import logging
import os
import subprocess
import signal # For os.kill on Unix-like systems
import shutil # For rmtree

from django.db import models # Keep only one import
from django.contrib.auth import get_user_model # Use get_user_model for User model
from django.contrib.gis.db import models as geomodels
from django.conf import settings
# import httpx # Not used in this file, can remove if not used elsewhere

from asgiref.sync import sync_to_async # Essential for async/sync bridging

logger = logging.getLogger(__name__)
User = get_user_model() # Get the currently active User model

class Camera(models.Model): 
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='cameras')
    name = models.CharField(max_length=100, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    location = geomodels.PointField(srid=4326, blank=True, null=True)
    rtsp_url = models.CharField(max_length=500, unique=True, help_text="RTSP URL of the camera (e.g., rtsp://user:pass@ip:port/stream)")
    stream_url = models.CharField(max_length=500, blank=True, null=True, 
                                  help_text="Generated web-friendly stream URL (e.g., HLS .m3u8). This will be managed by your streaming server.")
    ffmpeg_process_id = models.IntegerField(blank=True, null=True) 
    is_streaming = models.BooleanField(default=False)

    is_active = models.BooleanField(default=True) 
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} (ID: {self.id})"

    def get_hls_output_path(self):
        """
        Generates the full file path for the HLS playlist (.m3u8) for this camera.
        Ensures the directory exists.
        """
        # from django.conf import settings # Already imported at top
        stream_dir = os.path.join(settings.STREAMING_OUTPUT_DIR, str(self.id))
        os.makedirs(stream_dir, exist_ok=True) 
        return os.path.join(stream_dir, 'stream.m3u8')

    def get_hls_public_url(self):
        """
        Generates the public URL (relative to MEDIA_URL) for the HLS playlist.
        This is what the browser player will use.
        """
        return f"{settings.MEDIA_URL}hls_streams/{self.id}/stream.m3u8"

    async def start_stream(self):
        """
        Asynchronously starts the FFmpeg process for this camera's stream in the background.
        """
        if not hasattr(settings, 'STREAMING_OUTPUT_DIR'):
            logger.error("settings.STREAMING_OUTPUT_DIR is not defined. Cannot start stream.")
            return False

        stream_dir = os.path.join(settings.STREAMING_OUTPUT_DIR, str(self.id))
        os.makedirs(stream_dir, exist_ok=True) 

        hls_playlist_path = os.path.join(stream_dir, 'stream.m3u8')
        hls_segment_filename_pattern = os.path.join(stream_dir, 'stream%03d.ts')

        # --- NEW: Define a log file for FFmpeg's stderr ---
        ffmpeg_log_path = os.path.join(stream_dir, 'ffmpeg_error.log')

        ffmpeg_command = [
            'ffmpeg',
            '-y', 
            '-rtsp_transport', 'tcp',
            '-i', self.rtsp_url,
            '-c:v', 'libx264', 
            '-c:a', 'aac', 
            '-b:a', '128k',
            '-vf', 'scale=640:426', 
            '-hls_time', '4', 
            '-hls_list_size', '10', 
            '-hls_flags', 'delete_segments', 
            '-hls_segment_filename', hls_segment_filename_pattern,
            '-f', 'hls',
            hls_playlist_path
            ]

        try:
            logger.info(f"Attempting to start FFmpeg for Camera {self.id} with command: {' '.join(ffmpeg_command)}")
            logger.info(f"FFmpeg stderr will be redirected to: {ffmpeg_log_path}")

            # --- CRITICAL CHANGE: Redirect stderr to a file ---
            # Open the log file in write mode
            with open(ffmpeg_log_path, 'w') as f_stderr:
                process = await sync_to_async(subprocess.Popen)(
                    ffmpeg_command,
                    creationflags=subprocess.CREATE_NO_WINDOW, # For Windows
                    stdout=subprocess.DEVNULL, # Still discard stdout
                    stderr=f_stderr # Redirect stderr to the file
                )
            
            self.ffmpeg_process_id = process.pid
            self.stream_url = self.get_hls_public_url()
            self.is_streaming = True
            
            await self.asave(update_fields=['ffmpeg_process_id', 'stream_url', 'is_streaming']) 
            
            logger.info(f"FFmpeg process for Camera {self.id} started in background (PID: {self.ffmpeg_process_id}). HLS URL: {self.stream_url}")
            return True
        except FileNotFoundError:
            logger.error("FFmpeg not found. Please ensure FFmpeg is installed and added to your system's PATH.")
            self.is_streaming = False
            await self.asave(update_fields=['is_streaming']) 
            return False
        except Exception as e:
            logger.error(f"An unexpected error occurred while starting FFmpeg for Camera {self.id}: {e}", exc_info=True)
            self.is_streaming = False
            await self.asave(update_fields=['is_streaming']) 
            return False
    # --- Corrected stop_stream for cross-platform (more robust) ---
    async def stop_stream(self): # Made async to be called from async contexts
        if self.ffmpeg_process_id:
            try:
                # Use psutil for more robust process management if needed
                # For basic termination, check platform
                if os.name == 'nt': # Windows
                    # On Windows, os.kill is limited. Use taskkill or Popen.terminate()
                    # If you stored the Popen object, you could call .terminate()
                    # Since we only have PID, taskkill is a common approach.
                    await sync_to_async(subprocess.run)(
                        ['taskkill', '/F', '/PID', str(self.ffmpeg_process_id)],
                        capture_output=True, text=True, check=True
                    )
                    logger.info(f"FFmpeg process {self.ffmpeg_process_id} for Camera {self.id} terminated via taskkill.")
                else: # Unix-like (Linux, macOS)
                    await sync_to_async(os.kill)(self.ffmpeg_process_id, signal.SIGTERM) # SIGTERM is gentler
                    logger.info(f"FFmpeg process {self.ffmpeg_process_id} for Camera {self.id} terminated via SIGTERM.")

                # Give it a moment to terminate
                await sync_to_async(lambda: time.sleep(1))() # Small delay for process to clean up

                # Clean up HLS files
                stream_dir = os.path.join(settings.STREAMING_OUTPUT_DIR, str(self.id))
                if os.path.exists(stream_dir):
                    await sync_to_async(shutil.rmtree)(stream_dir) # Wrap rmtree in sync_to_async
                    logger.info(f"Cleaned up HLS stream directory: {stream_dir}")

            except subprocess.CalledProcessError as e:
                logger.error(f"Taskkill failed for PID {self.ffmpeg_process_id}: {e.stderr}", exc_info=True)
            except ProcessLookupError:
                logger.warning(f"FFmpeg process {self.ffmpeg_process_id} not found, already terminated or didn't exist for Camera {self.id}.")
            except Exception as e:
                logger.error(f"Error stopping FFmpeg for Camera {self.id}: {e}", exc_info=True)
            finally:
                self.ffmpeg_process_id = None
                self.is_streaming = False
                self.stream_url = None
                await self.asave(update_fields=['ffmpeg_process_id', 'is_streaming', 'stream_url']) # Use async save
        else:
            logger.info(f"No FFmpeg process found to stop for Camera {self.id}.")

    # Override save/delete to manage streaming process
    # Note: These are synchronous methods, so if called from an async view,
    # they would need to be wrapped with sync_to_async (e.g., await sync_to_async(camera.delete)())
    def save(self, *args, **kwargs):
        is_new = self._state.adding
        super().save(*args, **kwargs)
        if is_new or self.is_streaming: 
            pass 

    def delete(self, *args, **kwargs):
        # Call the async stop_stream method via sync_to_async
        # This requires a running event loop, which might not be guaranteed in all contexts
        # For simplicity, if delete is always called from an async view, this is fine.
        # If delete is called from a synchronous context (e.g., admin), you'd need to run_until_complete
        # or handle it differently.
        import asyncio
        try:
            asyncio.run(self.stop_stream()) # DANGER: This creates a new event loop. Only use for testing/simple cases.
                                            # Better: ensure delete is always called from an async context via sync_to_async
        except RuntimeError: # If an event loop is already running (e.g., from async view)
             # If called from an async view, the view should wrap it: await sync_to_async(camera.delete)()
             # which means this .delete() method is already in a sync_to_async thread.
             # So, calling await self.stop_stream() directly here is fine if this method is already sync_to_async-wrapped.
             # Let's adjust for the most common pattern:
             pass # Assume the caller (e.g., views.py) handles the sync_to_async for delete()

        super().delete(*args, **kwargs)

    class Meta:
        verbose_name_plural = "Cameras"
        ordering = ['name']

# If you want signals, remember to import time
import time
# from django.db.models.signals import post_save, pre_delete
# from django.dispatch import receiver

# @receiver(post_save, sender=Camera)
# def start_stream_on_save(sender, instance, created, **kwargs):
#     if created and instance.is_active: # Only start automatically when a new camera is created and is active
#         # Use asyncio.run for signals if they are synchronous
#         import asyncio
#         try:
#             asyncio.run(instance.start_stream())
#         except RuntimeError:
#             # If an event loop is already running (e.g., during tests or complex async startup)
#             # you might need to schedule it or run it in a separate thread.
#             # For simple cases, this might be okay.
#             logger.warning("Event loop already running, could not start stream from signal directly.")
#             # A more robust solution for signals:
#             # from asgiref.sync import sync_to_async
#             # sync_to_async(instance.start_stream)() # This would run it in a thread pool
#             pass


# @receiver(pre_delete, sender=Camera)
# def stop_stream_on_delete(sender, instance, **kwargs):
#     # Use asyncio.run for signals if they are synchronous
#     import asyncio
#     try:
#         asyncio.run(instance.stop_stream())
#     except RuntimeError:
#         logger.warning("Event loop already running, could not stop stream from signal directly.")
#         # sync_to_async(instance.stop_stream)() # Alternative for thread pool
#         pass