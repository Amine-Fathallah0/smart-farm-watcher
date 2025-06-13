# your_app/forms.py
from django import forms
from .models import Location

class LocationForm(forms.ModelForm):
    class Meta:
        model = Location
        fields = ['name', 'point', 'polygon'] 
        
        widgets = {
            'point': forms.HiddenInput(),
            'polygon': forms.HiddenInput(), # Corrected from 'shape' to 'polygon'
        }