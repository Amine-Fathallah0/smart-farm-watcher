# cameras/consumers.py

import json
from channels.generic.websocket import AsyncWebsocketConsumer

class CameraConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for real-time camera updates.
    Clients connect to this consumer to receive notifications
    when cameras are added, updated, or deleted.
    """
    async def connect(self):
        # Define a group name for all camera-related updates.
        # All clients interested in camera updates will join this group.
        self.camera_group_name = 'cameras' 

        # Add this consumer's channel to the 'cameras' group
        # This is CRUCIAL for receiving messages from the channel layer (e.g., from views.py)
        await self.channel_layer.group_add(
            self.camera_group_name,
            self.channel_name # The unique channel name for this specific connection
        )
        await self.accept() # Accept the WebSocket connection
        print(f"WebSocket connected: {self.channel_name} to group {self.camera_group_name}")


    async def disconnect(self, close_code):
        # Remove this consumer's channel from the 'cameras' group
        await self.channel_layer.group_discard(
            self.camera_group_name,
            self.channel_name
        )
        print(f"WebSocket disconnected: {self.channel_name}")

    # This method is called when the consumer receives a message from the WebSocket client.
    # (Not directly used for this feature, but good for testing bi-directional communication)
    async def receive(self, text_data):
        text_data_json = json.loads(text_data)
        message = text_data_json.get('message', 'No message provided')
        print(f"Received message from client: {message}")
        # Example: Echo back the message
        # await self.send(text_data=json.dumps({
        #     'message': f'You sent: {message}'
        # }))

    # This method is called when the consumer receives a message from the channel layer.
    # The 'type' in the channel layer message (e.g., 'camera_update') maps to this method name.
    # This is CRUCIAL for receiving updates from your views.py
    async def camera_update(self, event):
        camera_data = event['camera_data']
        message_type = event['message_type'] # e.g., 'camera_added', 'camera_deleted', 'camera_updated'

        # Send the camera data to the WebSocket client
        await self.send(text_data=json.dumps({
            'type': message_type, # Type of update (e.g., 'camera_added')
            'camera': camera_data # The camera object data
        }))
        print(f"Sent WebSocket message: {message_type} for camera {camera_data.get('id')}")

