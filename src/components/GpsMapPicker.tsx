import React, { useEffect, useRef } from "react";

interface GpsMapPickerProps {
  lat: number;
  lng: number;
  radius: number;
  onPositionChange: (lat: number, lng: number) => void;
}

export default function GpsMapPicker({ lat, lng, radius, onPositionChange }: GpsMapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (!mapContainerRef.current) return;

      const L = (await import("leaflet")).default;

      if (!mapInstanceRef.current && mapContainerRef.current) {
        const initialLat = isNaN(lat) || lat === 0 ? -6.914744 : lat;
        const initialLng = isNaN(lng) || lng === 0 ? 107.609810 : lng;

        const map = L.map(mapContainerRef.current).setView([initialLat, initialLng], 17);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);

        // Marker (draggable)
        const marker = L.marker([initialLat, initialLng], { draggable: true }).addTo(map);

        // Circle radius
        const circle = L.circle([initialLat, initialLng], {
          color: "#7C3AED",
          fillColor: "#8B5CF6",
          fillOpacity: 0.25,
          radius: radius || 150
        }).addTo(map);

        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          circle.setLatLng(pos);
          onPositionChange(parseFloat(pos.lat.toFixed(6)), parseFloat(pos.lng.toFixed(6)));
        });

        map.on("click", (e: any) => {
          const { lat: clickedLat, lng: clickedLng } = e.latlng;
          marker.setLatLng([clickedLat, clickedLng]);
          circle.setLatLng([clickedLat, clickedLng]);
          onPositionChange(parseFloat(clickedLat.toFixed(6)), parseFloat(clickedLng.toFixed(6)));
        });

        mapInstanceRef.current = map;
        markerRef.current = marker;
        circleRef.current = circle;
      }
    }

    initMap();

    return () => {
      isMounted = false;
    };
  }, []);

  // Update marker & circle when lat/lng/radius changes externally
  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current && circleRef.current) {
      const validLat = isNaN(lat) || lat === 0 ? -6.914744 : lat;
      const validLng = isNaN(lng) || lng === 0 ? 107.609810 : lng;

      const newLatLng = [validLat, validLng];
      markerRef.current.setLatLng(newLatLng);
      circleRef.current.setLatLng(newLatLng);
      circleRef.current.setRadius(radius || 150);
      mapInstanceRef.current.panTo(newLatLng);
    }
  }, [lat, lng, radius]);

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-xs font-bold text-slate-600">
        <span>📍 Klik peta atau geser Pin untuk menentukan lokasi akurat sekolah:</span>
        <span className="text-purple-600">Radius: {radius}m</span>
      </div>
      <div
        ref={mapContainerRef}
        className="w-full h-72 rounded-2xl border border-purple-200 overflow-hidden shadow-inner z-10"
      />
    </div>
  );
}
