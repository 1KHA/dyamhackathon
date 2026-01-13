"use client";
import React from "react";

interface LoaderProps {
  className?: string;
  isVisible?: boolean;
}

export default function Loader({ className = "", isVisible = true }: LoaderProps) {
  return (
    <div 
      className={`fixed inset-0 bg-white flex items-center justify-center z-50 transition-opacity duration-500 ${
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      } ${className}`}
      style={{ zIndex: 9999 }}
    >
      <div className="flex flex-col items-center justify-center">
        <img
          src="/alvira.png"
          alt="Loading..."
          className="max-w-xs w-60 h-auto animate-pulse"
          style={{
            maxWidth: "240px",
            width: "60vw",
            height: "auto",
            objectFit: "contain"
          }}
        />
      </div>
    </div>
  );
}
