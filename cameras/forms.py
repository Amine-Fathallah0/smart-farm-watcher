from django import forms
from .models import Camera
from django.contrib.gis.forms import PointField

class CameraForm(forms.ModelForm):
    # If you want to manually input coords, or have a hidden field for JS
    # location = PointField(widget=forms.HiddenInput(), required=False) 

    class Meta:
        model = Camera
        # Exclude 'stream_url' as it's managed by the backend streaming process
        fields = ['name', 'description', 'rtsp_url', 'location', 'is_active']
        widgets = {
            # If you want to use a simple text input for lat/lon for location
            # 'location': forms.TextInput(attrs={'placeholder': 'e.g., POINT (10.123 34.456)'}),

            # If you want to hide location and populate via JS click
            'location': forms.HiddenInput(), 
        }
        # Optional: Add help text to fields if needed
        help_texts = {
            'rtsp_url': 'Full RTSP URL, e.g., rtsp://user:pass@192.168.1.100:554/stream',
            'is_active': 'Check to enable streaming for this camera.',
        }
