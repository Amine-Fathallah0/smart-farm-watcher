from cameras.models import Camera
import os
import shutil
from django.conf import settings
import logging
import subprocess

logger = logging.getLogger(__name__)

# Stop any FFmpeg processes associated with cameras (if they are still running)
# This loop will attempt to stop processes for all cameras in the DB
for camera in Camera.objects.all():
    if camera.ffmpeg_process_id:
        try:
            if os.name == 'nt': # Windows
                subprocess.run(['taskkill', '/F', '/PID', str(camera.ffmpeg_process_id)], capture_output=True, text=True, check=True)
                logger.info(f"Taskkill: Terminated FFmpeg process {camera.ffmpeg_process_id} for Camera {camera.id}.")
            else: # Unix-like
                os.kill(camera.ffmpeg_process_id, signal.SIGTERM)
                logger.info(f"SIGTERM: Terminated FFmpeg process {camera.ffmpeg_process_id} for Camera {camera.id}.")
        except (subprocess.CalledProcessError, ProcessLookupError) as e:
            logger.warning(f"Could not terminate FFmpeg process {camera.ffmpeg_process_id} for Camera {camera.id}: {e}")
        except Exception as e:
            logger.error(f"Unexpected error during FFmpeg process termination for Camera {camera.id}: {e}")
    # Clean up HLS directories for this camera
    stream_dir = os.path.join(settings.STREAMING_OUTPUT_DIR, str(camera.id))
    if os.path.exists(stream_dir):
        try:
            shutil.rmtree(stream_dir)
            logger.info(f"Cleaned up HLS stream directory: {stream_dir}")
        except OSError as e:
            logger.error(f"Error removing directory {stream_dir}: {e}")

# Delete all camera objects from the database
Camera.objects.all().delete()
print("All Camera objects deleted from the database.")