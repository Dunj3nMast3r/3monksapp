package com.threemonks.service;

import com.threemonks.dto.RawMaterialRequest;
import com.threemonks.dto.RawMaterialResponse;
import com.threemonks.entity.RawMaterial;
import com.threemonks.enums.RawMaterialCategory;
import com.threemonks.enums.UnitType;
import com.threemonks.exception.BadRequestException;
import com.threemonks.exception.ResourceNotFoundException;
import com.threemonks.repository.RawMaterialRepository;
import com.threemonks.repository.StockRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class RawMaterialService {

    private final RawMaterialRepository rawMaterialRepository;
    private final StockRepository stockRepository;

    public List<RawMaterialResponse> getAllRawMaterials() {
        return rawMaterialRepository.findAll().stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    public List<RawMaterialResponse> getActiveRawMaterials() {
        return rawMaterialRepository.findByActiveTrue().stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    public RawMaterialResponse getRawMaterialById(Long id) {
        return toResponse(findById(id));
    }

    @Transactional
    public RawMaterialResponse createRawMaterial(RawMaterialRequest request) {
        RawMaterialCategory category = categoryOf(request);
        RawMaterial rm = RawMaterial.builder()
                .name(request.getName())
                .category(category)
                .unitType(unitFor(category, request.getUnitType()))
                .costPerUnit(request.getCostPerUnit())
                .vendorName(request.getVendorName())
                .vendorContact(request.getVendorContact())
                .expiryDate(request.getExpiryDate())
                .reorderLevel(request.getReorderLevel())
                .active(true)
                .build();
        return toResponse(rawMaterialRepository.save(rm));
    }

    @Transactional
    public RawMaterialResponse updateRawMaterial(Long id, RawMaterialRequest request) {
        RawMaterial rm = findById(id);
        RawMaterialCategory category = categoryOf(request);
        UnitType unit = unitFor(category, request.getUnitType());
        // Existing balances and history are in the old unit; changing it would silently rescale them
        if (unit != rm.getUnitType() && stockRepository.existsByRawMaterialId(id)) {
            throw new BadRequestException("The unit of " + rm.getName()
                    + " cannot change because stock has already been recorded in " + rm.getUnitType() + ".");
        }
        rm.setName(request.getName());
        rm.setCategory(category);
        rm.setUnitType(unit);
        rm.setCostPerUnit(request.getCostPerUnit());
        rm.setVendorName(request.getVendorName());
        rm.setVendorContact(request.getVendorContact());
        rm.setExpiryDate(request.getExpiryDate());
        rm.setReorderLevel(request.getReorderLevel());
        return toResponse(rawMaterialRepository.save(rm));
    }

    @Transactional
    public void toggleRawMaterialStatus(Long id) {
        RawMaterial rm = findById(id);
        rm.setActive(!rm.getActive());
        rawMaterialRepository.save(rm);
    }

    private static RawMaterialCategory categoryOf(RawMaterialRequest request) {
        return request.getCategory() != null ? request.getCategory() : RawMaterialCategory.OTHER;
    }

    // Fruits are always kept in KG
    private static UnitType unitFor(RawMaterialCategory category, UnitType requested) {
        if (category == RawMaterialCategory.FRUIT) {
            return UnitType.KG;
        }
        if (requested == null) {
            throw new BadRequestException("Unit type is required");
        }
        return requested;
    }

    private RawMaterial findById(Long id) {
        return rawMaterialRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("RawMaterial", "id", id));
    }

    private RawMaterialResponse toResponse(RawMaterial rm) {
        return RawMaterialResponse.builder()
                .id(rm.getId())
                .name(rm.getName())
                .unitType(rm.getUnitType())
                .category(rm.getCategory())
                .costPerUnit(rm.getCostPerUnit())
                .vendorName(rm.getVendorName())
                .vendorContact(rm.getVendorContact())
                .expiryDate(rm.getExpiryDate())
                .reorderLevel(rm.getReorderLevel())
                .lastPurchaseDate(rm.getLastPurchaseDate())
                .active(rm.getActive())
                .build();
    }
}
