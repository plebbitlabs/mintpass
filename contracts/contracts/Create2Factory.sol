// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Create2Factory
 * @dev Simple CREATE2 factory for deterministic deployments on L2 networks
 * @notice This factory works reliably on Base, Arbitrum, Optimism where standard factories fail
 */
contract Create2Factory {
    event ContractDeployed(address indexed deployed, bytes32 indexed salt, address indexed deployer);

    /**
     * @dev Deploys a contract using CREATE2
     * @param salt The salt for deterministic address generation
     * @param bytecode The creation bytecode of the contract to deploy
     * @return deployed The address of the deployed contract
     */
    function deploy(bytes32 salt, bytes memory bytecode) external returns (address deployed) {
        // Deploy using CREATE2
        assembly {
            deployed := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
            
            // Check if deployment failed
            if iszero(deployed) {
                // Get the revert reason
                returndatacopy(0, 0, returndatasize())
                revert(0, returndatasize())
            }
        }
        
        // Ensure deployment succeeded
        require(deployed != address(0), "Create2Factory: deployment failed");
        
        // Verify that code was actually deployed
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(deployed)
        }
        require(codeSize > 0, "Create2Factory: no code deployed");
        
        emit ContractDeployed(deployed, salt, msg.sender);
        return deployed;
    }

    /**
     * @dev Computes the address of a contract deployed via CREATE2
     * @param salt The salt used for deployment
     * @param bytecode The creation bytecode of the contract
     * @return The predicted address of the contract
     */
    function predictAddress(bytes32 salt, bytes memory bytecode) external view returns (address) {
        bytes32 bytecodeHash = keccak256(bytecode);
        return _computeAddress(salt, bytecodeHash);
    }

    /**
     * @dev Computes the address using salt and bytecode hash (external version)
     * @param salt The salt for address generation
     * @param bytecodeHash The hash of the creation bytecode
     * @return The computed address
     */
    function getAddressFromHash(bytes32 salt, bytes32 bytecodeHash) external view returns (address) {
        return _computeAddress(salt, bytecodeHash);
    }

    /**
     * @dev Computes the address using salt and bytecode hash
     * @param salt The salt for address generation
     * @param bytecodeHash The hash of the creation bytecode
     * @return The computed address
     */
    function computeAddress(bytes32 salt, bytes32 bytecodeHash) external view returns (address) {
        return _computeAddress(salt, bytecodeHash);
    }

    /**
     * @dev Internal function to compute CREATE2 address
     * @param salt The salt for address generation
     * @param bytecodeHash The hash of the creation bytecode
     * @return The computed address
     */
    function _computeAddress(bytes32 salt, bytes32 bytecodeHash) internal view returns (address) {
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff),
                            address(this),
                            salt,
                            bytecodeHash
                        )
                    )
                )
            )
        );
    }
} 