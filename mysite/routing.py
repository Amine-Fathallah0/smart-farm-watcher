from channels.routing import ProtocolTypeRouter, URLRouter
from django.urls import re_path

# Import WebSocket URL patterns from your apps
import cameras.routing 

websocket_urlpatterns = [
    # Include patterns from the cameras app
    re_path(r'^ws/', URLRouter(cameras.routing.websocket_urlpatterns)),
    # If you had other apps with WebSockets, you'd add them here too:
    # re_path(r'^ws/other_app/', URLRouter(other_app.routing.websocket_urlpatterns)),
]