// Custom shapes library

module custom_knob() {
    cylinder(h=5, r=8);
    translate([0, 0, 5])
        sphere(r=4);
}

module rounded_cube(size, radius=2) {
    hull() {
        for (x = [radius, size[0]-radius]) {
            for (y = [radius, size[1]-radius]) {
                for (z = [radius, size[2]-radius]) {
                    translate([x, y, z])
                        sphere(r=radius);
                }
            }
        }
    }
}