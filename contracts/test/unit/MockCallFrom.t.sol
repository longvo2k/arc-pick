// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockCallFrom} from "../../src/mocks/MockCallFrom.sol";

contract Sink {
    uint256 public lastValue;
    function record(uint256 v) external { lastValue = v; }
    function nope() external pure { revert("nope"); }
}

contract MockCallFromTest is Test {
    MockCallFrom cf;
    Sink sink;

    event CalledFrom(address indexed impersonated, address indexed target, bytes data);

    function setUp() public {
        cf = new MockCallFrom();
        sink = new Sink();
    }

    function test_callFrom_emitsEventAndRecords() public {
        address impersonated = address(0xBEEF);
        bytes memory data = abi.encodeCall(Sink.record, (42));
        vm.expectEmit(true, true, false, true, address(cf));
        emit CalledFrom(impersonated, address(sink), data);
        cf.callFrom(impersonated, address(sink), data);
        assertEq(sink.lastValue(), 42);
        assertEq(cf.callCount(), 1);
        MockCallFrom.Call memory c = cf.lastCall();
        assertEq(c.impersonated, impersonated);
        assertEq(c.target, address(sink));
        assertTrue(c.ok);
    }

    function test_callFrom_bubblesRevert() public {
        bytes memory badData = abi.encodeWithSignature("nope()");
        vm.expectRevert();
        cf.callFrom(address(0xCAFE), address(sink), badData);
    }
}
