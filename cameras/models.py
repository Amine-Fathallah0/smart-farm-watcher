import logging # <--- MAKE SURE THIS IS HERE
import os 
import subprocess
import signal
from django.db import models
from django.db import models
from django.contrib.auth.models import User
from django.contrib.gis.db import models as geomodels
from django.conf import settings
import httpx
from asgiref.sync import sync_to_async

logger = logging.getLogger(__name__) # <--- ADD THIS LINE TO SET UP LOGGING
# Create your models here.
class Camera(models.Model): 
    user= models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='cameras')
    name = models.CharField(max_length=100, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    location = geomodels.PointField(srid=4326, blank=True, null=True) # GeoDjango Point field for map display
    rtsp_url = models.CharField(max_length=500, unique=True, help_text="RTSP URL of the camera (e.g., rtsp://user:pass@ip:port/stream)")
    stream_url = models.CharField(max_length=500, blank=True, null=True, 
                                  help_text="Generated web-friendly stream URL (e.g., HLS .m3u8). This will be managed by your streaming server.")
    ffmpeg_process_id = models.IntegerField(blank=True, null=True) 
    is_streaming = models.BooleanField(default=False)

    is_active = models.BooleanField(default=True) # To indicate if the stream is supposed to be running
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    def __str__(self):
        return f"{self.name} (ID: {self.id})"

    def get_hls_output_path(self):
        """
        Generates the full file path for the HLS playlist (.m3u8) for this camera.
        Ensures the directory exists.
        """
        from django.conf import settings
        # Create a unique directory for each camera's HLS stream based on its ID
        stream_dir = os.path.join(settings.STREAMING_OUTPUT_DIR, str(self.id))
        os.makedirs(stream_dir, exist_ok=True) # Ensure directory exists
        return os.path.join(stream_dir, 'stream.m3u8') # Return the path to the main HLS playlist

    def get_hls_public_url(self):
        """
        Generates the public URL (relative to MEDIA_URL) for the HLS playlist.
        This is what the browser player will use.
        """
        return f"{settings.MEDIA_URL}hls_streams/{self.id}/stream.m3u8"

    async def start_stream(self):
        """
        Asynchronously starts the FFmpeg process for this camera's stream.
        """
        # Ensure STREAMING_OUTPUT_DIR is defined in your settings.py
        # e.g., STREAMING_OUTPUT_DIR = os.path.join(BASE_DIR, 'media', 'hls_streams')
        
        # --- Make sure settings.STREAMING_OUTPUT_DIR is correctly defined ---
        if not hasattr(settings, 'STREAMING_OUTPUT_DIR'):
            logger.error("settings.STREAMING_OUTPUT_DIR is not defined. Cannot start stream.")
            return False

        stream_dir = os.path.join(settings.STREAMING_OUTPUT_DIR, str(self.id))
        
        # os.makedirs is also a blocking call, but for creating a directory,
        # it's usually very fast and rarely a bottleneck. If it were, you'd
        # wrap it in sync_to_async as well. For now, we'll assume it's fine.
        os.makedirs(stream_dir, exist_ok=True) 

        hls_playlist_path = os.path.join(stream_dir, 'stream.m3u8')
        hls_segment_filename_pattern = os.path.join(stream_dir, 'stream%03d.ts')

        ffmpeg_command = [
            'ffmpeg',
            '-y', # Overwrite output files without asking
            '-i', self.rtsp_url,
            '-c:v', 'copy', # Copy video stream directly without re-encoding
            '-c:a', 'aac', # Re-encode audio to AAC
            '-b:a', '128k', # Audio bitrate
            '-hls_time', '2', # Segment duration in seconds
            '-hls_list_size', '3', # Number of segments in the playlist
            '-hls_flags', 'delete_segments', # Delete old segments
            '-hls_segment_filename', hls_segment_filename_pattern,
            '-f', 'hls',
            hls_playlist_path
        ]

        try:
            logger.info(f"Starting FFmpeg for Camera {self.id} with command: {' '.join(ffmpeg_command)}")
            
            # --- CRITICAL CHANGE: Wrap subprocess.Popen in sync_to_async ---
            # subprocess.Popen is a blocking I/O operation and must be run
            # in a separate thread when called from an async function.
            process = await sync_to_async(subprocess.Popen)(
                ffmpeg_command,
                # For Windows:
                creationflags=subprocess.CREATE_NO_WINDOW
                # For Linux/macOS, typically remove creationflags:
                # ffmpeg_command
            )
            
            # REMOVE httpx.AsyncClient() - it's not used for subprocess calls
            # The 'async with httpx.AsyncClient() as client:' block is not needed here.

            self.ffmpeg_process_id = process.pid
            self.stream_url = self.get_hls_public_url()
            self.is_streaming = True
            
            # Use async save methods for model instances within async functions
            await self.asave(update_fields=['ffmpeg_process_id', 'stream_url', 'is_streaming']) 
            
            logger.info(f"FFmpeg process started for Camera {self.id} (PID: {self.ffmpeg_process_id}). HLS URL: {self.stream_url}")
            return True
        except FileNotFoundError:
            logger.error("FFmpeg not found. Please ensure FFmpeg is installed and added to your system's PATH.")
            self.is_streaming = False
            await self.asave(update_fields=['is_streaming']) # Use async save
            return False
        except Exception as e:
            logger.error(f"Error starting FFmpeg for Camera {self.id}: {e}")
            self.is_streaming = False
            await self.asave(update_fields=['is_streaming']) # Use async save
            return False
            
    # Note: For this simplified approach, we are NOT adding a stop_stream method here.
    # FFmpeg processes started this way will continue running until they fail, 
    # or you manually stop them from your operating system (e.g., using `pkill ffmpeg` 
    # on Linux/macOS or Task Manager on Windows).
    def stop_stream(self):
        if self.ffmpeg_process_id:
            try:
                # Terminate the FFmpeg process
                os.kill(self.ffmpeg_process_id, signal.SIGTERM) # Or signal.SIGKILL for forceful termination
                logger.info(f"FFmpeg process {self.ffmpeg_process_id} for Camera {self.id} terminated.")

                # Clean up HLS files
                stream_dir = os.path.join(settings.STREAMING_OUTPUT_DIR, str(self.id))
                if os.path.exists(stream_dir):
                    # Use shutil.rmtree for directory deletion
                    import shutil
                    shutil.rmtree(stream_dir)
                    logger.info(f"Cleaned up HLS stream directory: {stream_dir}")

            except ProcessLookupError:
                logger.warning(f"FFmpeg process {self.ffmpeg_process_id} not found, already terminated or didn't exist for Camera {self.id}.")
            except Exception as e:
                logger.error(f"Error stopping FFmpeg for Camera {self.id}: {e}")
            finally:
                self.ffmpeg_process_id = None
                self.is_streaming = False
                self.stream_url = None
                self.save(update_fields=['ffmpeg_process_id', 'is_streaming', 'stream_url'])
        else:
            logger.info(f"No FFmpeg process found to stop for Camera {self.id}.")

    # Override save/delete to manage streaming process
    def save(self, *args, **kwargs):
        is_new = self._state.adding
        super().save(*args, **kwargs)
        if is_new or self.is_streaming: # If new or already marked as streaming
            # Optionally restart if settings change, or rely on explicit start action
            pass # We'll start it via a view/admin action

    def delete(self, *args, **kwargs):
        self.stop_stream() # Stop stream before deleting camera
        super().delete(*args, **kwargs)

# Connect signals if you have them, e.g., post_save to start stream
# from django.db.models.signals import post_save, pre_delete
# from django.dispatch import receiver

# @receiver(post_save, sender=Camera)
# def start_stream_on_save(sender, instance, created, **kwargs):
#     if created: # Only start automatically when a new camera is created
#         instance.start_stream()

# @receiver(pre_delete, sender=Camera)
# def stop_stream_on_delete(sender, instance, **kwargs):
#     instance.stop_stream()
    class Meta:
        verbose_name_plural = "Cameras"
        ordering = ['name']