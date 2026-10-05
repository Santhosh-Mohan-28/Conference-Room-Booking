"use client";

import React, { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { standardEquipmentOptions } from "@/lib/validations";
import { ArrowLeft, Save, Building2, CheckSquare, Square } from "lucide-react";
import Link from "next/link";

export default function NewRoomPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    roomCode: "",
    name: "",
    building: "",
    floor: 1,
    capacity: 10,
    description: "",
    equipment: ["Video conferencing", "Whiteboard"] as string[],
    isActive: true,
  });

  const [customEquipment, setCustomEquipment] = useState("");

  const handleEquipmentToggle = (item: string) => {
    setFormData((prev) => {
      const exists = prev.equipment.includes(item);
      return {
        ...prev,
        equipment: exists
          ? prev.equipment.filter((i) => i !== item)
          : [...prev.equipment, item],
      };
    });
  };

  const handleAddCustomEquipment = () => {
    if (!customEquipment.trim()) return;
    const trimmed = customEquipment.trim();
    if (!formData.equipment.includes(trimmed)) {
      setFormData((prev) => ({
        ...prev,
        equipment: [...prev.equipment, trimmed],
      }));
    }
    setCustomEquipment("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          floor: Number(formData.floor),
          capacity: Number(formData.capacity),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to create conference room");
      }

      success(`Conference room '${formData.name}' (${formData.roomCode}) created successfully!`);
      router.push("/rooms");
    } catch (err: any) {
      toastError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout requireAdminRole={true}>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-3">
          <Link
            href="/rooms"
            className="p-2 text-slate-500 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              Add New Conference Room
            </h1>
            <p className="text-xs text-slate-500">
              Provision a new physical or virtual conference room on the corporate campus.
            </p>
          </div>
        </div>

        {/* Form Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/90 shadow-xs space-y-6"
        >
          {/* Section 1: Basic Identifiers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Room Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Aryabhata Boardroom"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Unique Room Code <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. BLR-01-A"
                value={formData.roomCode}
                onChange={(e) =>
                  setFormData({ ...formData, roomCode: e.target.value.toUpperCase() })
                }
                className="w-full px-3.5 py-2 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Must be unique across all buildings.
              </span>
            </div>
          </div>

          {/* Section 2: Location and Capacity */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Building <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Tower A (Main Campus)"
                value={formData.building}
                onChange={(e) => setFormData({ ...formData, building: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Floor <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                required
                min="-5"
                max="100"
                value={formData.floor}
                onChange={(e) => setFormData({ ...formData, floor: parseInt(e.target.value) || 0 })}
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Seating Capacity <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                required
                min="1"
                max="500"
                value={formData.capacity}
                onChange={(e) =>
                  setFormData({ ...formData, capacity: parseInt(e.target.value) || 1 })
                }
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          {/* Section 3: Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Description & Amenities
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Executive boardroom with dual 4K monitors and whiteboard..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* Section 4: Equipment Checklist */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Available Equipment
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {standardEquipmentOptions.map((item) => {
                const isSelected = formData.equipment.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => handleEquipmentToggle(item)}
                    className={`flex items-center space-x-2 p-2.5 rounded-xl border text-xs font-medium text-left transition-colors ${
                      isSelected
                        ? "bg-blue-50 border-blue-200 text-blue-800"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    )}
                    <span>{item}</span>
                  </button>
                );
              })}
            </div>

            {/* Custom Equipment Input */}
            <div className="flex gap-2 mt-3">
              <input
                type="text"
                placeholder="Add custom hardware or amenity..."
                value={customEquipment}
                onChange={(e) => setCustomEquipment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCustomEquipment();
                  }
                }}
                className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              />
              <button
                type="button"
                onClick={handleAddCustomEquipment}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl"
              >
                Add Item
              </button>
            </div>
          </div>

          {/* Section 5: Active Status */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-800">Room Status</span>
              <p className="text-xs text-slate-500">
                Immediately make this room available for employee view and reservations.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Submit Buttons */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
            <Link
              href="/rooms"
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm shadow-blue-500/20 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? "Saving Room..." : "Create Room"}</span>
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
