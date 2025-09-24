// More complex model with modules
include <lib/shapes.scad>

// Parameters
wall_thickness = 2;
box_size = [50, 30, 20];

// Main model
difference() {
    // Outer box
    cube(box_size);
    
    // Inner cavity
    translate([wall_thickness, wall_thickness, wall_thickness])
        cube([
            box_size[0] - 2*wall_thickness,
            box_size[1] - 2*wall_thickness,
            box_size[2] - wall_thickness
        ]);
}

// Add decorative elements
translate([box_size[0]/2, box_size[1]/2, box_size[2]])
    custom_knob();